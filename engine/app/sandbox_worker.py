from __future__ import annotations
import ast,ctypes,ctypes.util,hashlib,json,math,resource,sys,types
import numpy as np
import pandas as pd
import pytz
from . import orb_reference
from .execution import execute
from .sandbox import REFERENCE_HASH


def restrict_syscalls():
    name=ctypes.util.find_library('seccomp')
    if not name: raise ValueError('Secure model sandbox is unavailable; deploy the updated Engine image')
    lib=ctypes.CDLL(name)
    lib.seccomp_init.argtypes=[ctypes.c_uint32]; lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p]; lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint]
    lib.seccomp_load.argtypes=[ctypes.c_void_p]; lib.seccomp_release.argtypes=[ctypes.c_void_p]
    ctx=lib.seccomp_init(0x00050000|1) # EPERM by default. No network, files, process creation, ptrace, or signal injection.
    if not ctx: raise ValueError('Cannot initialize sandbox')
    for name in ('read','write','close','fstat','newfstatat','lseek','mmap','mprotect','munmap','brk','madvise',
                 'rt_sigaction','rt_sigprocmask','rt_sigreturn','futex','sched_yield','clock_gettime',
                 'getpid','gettid','getrandom','exit','exit_group','arch_prctl','set_robust_list','rseq'):
        syscall=lib.seccomp_syscall_resolve_name(name.encode())
        if syscall>=0 and lib.seccomp_rule_add(ctx,0x7fff0000,syscall,0)!=0: raise ValueError('Cannot restrict sandbox')
    if lib.seccomp_load(ctx)!=0: raise ValueError('Sandbox isolation could not be enabled')
    lib.seccomp_release(ctx)


def clean(v):
    if isinstance(v,dict): return {k:clean(x) for k,x in v.items()}
    if isinstance(v,(list,tuple)): return [clean(x) for x in v]
    if isinstance(v,(np.integer,)): return int(v)
    if isinstance(v,(np.floating, float)): return float(v) if math.isfinite(v) else None
    if isinstance(v,(pd.Timestamp,)): return None if pd.isna(v) else v.isoformat()
    if v is pd.NaT: return None
    if hasattr(v,'isoformat'): return v.isoformat()
    return v


def main():
    resource.setrlimit(resource.RLIMIT_CPU,(80,85))
    resource.setrlimit(resource.RLIMIT_AS,(1_500_000_000,1_500_000_000))
    resource.setrlimit(resource.RLIMIT_FSIZE,(20_000_000,20_000_000))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    data=json.load(sys.stdin); code=data['code']; params=data.get('params',{}); spec=data.get('spec',{})
    frame=pd.DataFrame(data['bars'])
    if frame.empty: raise ValueError('No candles in the selected date range')
    frame.index=pd.to_datetime(frame.pop('ts_utc'),utc=True)
    frame['spread']=frame.get('spread',pd.Series(0,index=frame.index)).fillna(0)
    for timezone in ('UTC','America/New_York','Europe/London',params.get('tz','America/New_York')): pytz.timezone(timezone)
    trusted=hashlib.sha256(code.encode()).hexdigest()==REFERENCE_HASH
    if trusted:
        allowed={k:v for k,v in params.items() if k in orb_reference.Params.__dataclass_fields__}
        if 'point' not in allowed: allowed['point']=spec.get('point_size',.01)
        P=orb_reference.Params(**allowed)
        result=orb_reference.apply_pnl_rule(orb_reference.run(frame,P,data.get('engine','A')),P)
        trades=[]
        for row in result.to_dict('records'):
            if row['status'] not in ('TP','SL','TIMEOUT'): continue
            segment=frame.loc[row['entry_time'].tz_convert('UTC'):row['exit_time'].tz_convert('UTC')]
            # Conservative full-entry-bar bound, disclosed in result metadata.
            long=row['side']=='long'
            mae=max(0,row['entry']-segment.low.min() if long else segment.high.max()-row['entry'])
            mfe=max(0,segment.high.max()-row['entry'] if long else row['entry']-segment.low.min())
            trades.append({**row,'day':row['date'].isoformat(),'reason':row['status'],'half_range':row['d'],'mae':mae,'mfe':mfe})
        output={'trades':trades,'daily':result.to_dict('records'),'summary':orb_reference.summarise(result,P),
                'warnings':['Legacy ORB adapter: uploaded execution and 19/60 PnL preserved; entry-bar MAE/MFE are conservative whole-bar bounds.'],
                'interface':'orb_legacy'}
    else:
        tree=ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node,(ast.Import,ast.ImportFrom)):
                names=[a.name.split('.')[0] for a in node.names] if isinstance(node,ast.Import) else [(node.module or '').split('.')[0]]
                if any(n not in ('numpy','pandas','math','dataclasses','datetime','zoneinfo','typing','collections') for n in names):
                    raise ValueError('Model imports are restricted to approved computational libraries')
        module=types.ModuleType('uploaded_model');sys.modules['uploaded_model']=module
        restrict_syscalls()
        exec(compile(tree,'<model>','exec'),module.__dict__)
        if not isinstance(getattr(module,'META',None),dict): raise ValueError('Model must define META')
        output=execute(module,frame,params,spec)
        output['meta']=module.META;output['interface']='contract_v1'
    print(json.dumps(clean(output),allow_nan=False))

if __name__=='__main__':
    try: main()
    except Exception as e: print(json.dumps({'error':str(e)[:300]}))
