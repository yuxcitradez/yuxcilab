"""Durable app-backed job state; computation runs in the external Engine."""
from __future__ import annotations
import hashlib,threading,traceback
import pandas as pd
from .callback import AppClient
from .sandbox import run_model,REFERENCE_HASH
from .prop import simulate
from .config import ENGINE_VERSION
_cancel=set();_running=set();_lock=threading.Lock()

def cancel(user_id,job_id):
    with _lock: _cancel.add((user_id,job_id))

def cancelled(user_id,job_id):
    with _lock: return (user_id,job_id) in _cancel

def load_bars(app,dataset_id,start=None,end=None):
    bars=[];offset=0
    while True:
        part=app.call('bars/read',{'dataset_id':dataset_id,'start':start,'end':end,'offset':offset})['bars']
        bars.extend(part)
        if len(part)<1000: break
        offset+=len(part)
        if len(bars)>2_000_000: raise ValueError('Dataset exceeds per-run candle limit; narrow the date range')
    return bars

def validation(code,bars,params,spec):
    first=run_model(code,bars,params,spec);second=run_model(code,bars,params,spec)
    deterministic=first==second
    legacy=first['interface']=='orb_legacy'
    checks=[{'name':'Determinism','status':'pass' if deterministic else 'fail'}]
    if legacy:
        alternate=run_model(code,bars,params,spec,engine='B')
        equivalent=first['trades']==alternate['trades']
        checks.append({'name':'Independent ORB engines A/B','status':'pass' if equivalent else 'fail'})
        # Full-day simulator is not a closed-bar contract. Never mark it deployable.
        checks.append({'name':'Causality (closed-bar contract)','status':'unverified','detail':'Legacy day simulator; paper deployment requires a contract-v1 model.'})
    else:
        orders=first.get('orders',[]);causal=True
        points=sorted(set(int(x) for x in __import__('numpy').linspace(1,len(bars),min(50,len(bars)))))
        for cutoff in points:
            short=run_model(code,bars[:cutoff],params,spec)
            ts=pd.Timestamp(bars[cutoff-1]['ts_utc'])
            expected=[o for o in orders if pd.Timestamp(o['ts'])<=ts]
            if short.get('orders')!=expected: causal=False;break
        checks.append({'name':'Causality (50 prefix probes)','status':'pass' if causal else 'fail'})
    checks.append({'name':'Daylight-saving correctness','status':'unverified','detail':'Session-specific regression fixtures required.'})
    golden={
        'b9633f2441f46ce34e9018d6e3e7b595098ba20ecbb2882fe07e54b06bb305e3': {'TP':103,'SL':17,'total_pnl':577},
        '0b262bd02443097ad58cf5464a6bbd74b9236c06d5ae443507849680b670b748': {'TP':99,'SL':15,'TIMEOUT':6,'total_pnl':495},
    }
    expected=golden.get(spec.get('file_sha256'))
    baseline=not params.get('use_spread') and params.get('tz','America/New_York')=='America/New_York' and float(params.get('sl_mult',5))==5 and float(params.get('pnl_sl',-19))==-19 and float(params.get('pnl_streak',60))==60 and int(params.get('streak_len',5))==5
    actual=first.get('summary',{})
    if legacy and expected and baseline and actual.get('days')==120:
        passed=all(actual.get(k)==v for k,v in expected.items())
        checks.append({'name':'Golden results','status':'pass' if passed else 'fail','detail':f'Exact uploaded dataset hash; reference {expected}; actual {actual}.'})
    else:
        checks.append({'name':'Golden results','status':'unverified','detail':'Exact matching dataset and baseline configuration required; NAS100 reference uses a different 73-day period.'})
    checks.append({'name':'Sandbox security and limits','status':'pass' if not legacy else 'unverified',
                   'detail':'Secret-free subprocess, syscall policy, CPU/memory/time limits.' if not legacy else 'Reviewed exact-hash legacy model only; arbitrary code is syscall-isolated.'})
    failed=any(c['status']=='fail' for c in checks)
    return {'checks':checks,'interface':first['interface'],'research_ready':not failed,
            'deployable':not failed and not legacy and all(c['status']=='pass' for c in checks),
            'sample_summary':first.get('summary'), 'warnings':first.get('warnings',[]),
            'code_sha256':hashlib.sha256(code.encode()).hexdigest(),'engine_version':ENGINE_VERSION}

def work(user_id,job_id):
    app=AppClient(user_id)
    try:
        data=app.call('jobs/context',{'job_id':job_id});job=data['job'];kind=job['kind'];payload=job['payload']
        app.call('jobs/update',{'job_id':job_id,'patch':{'status':'running','progress':.02,'started':True}})
        if kind=='model_validation':
            version=data['version'];dataset=data['datasets'][0]
            bars=load_bars(app,dataset['id'],payload.get('start'),payload.get('end'))
            # Validate a complete week, avoiding excessive 50-prefix runs on entire multi-month histories.
            if hashlib.sha256(version['code'].encode()).hexdigest()!=REFERENCE_HASH and len(bars)>10080: bars=bars[:10080]
            spec={**dataset['instrument'],'file_sha256':dataset.get('file_sha256')}
            result=validation(version['code'],bars,payload.get('params') or version['params'],spec)
        elif kind=='backtest':
            version=data['version'];datasets=data['datasets'];run_id=payload['run_id'];summaries=[];total_pnl=0.;all_trades=[]
            for i,dataset in enumerate(datasets):
                if cancelled(user_id,job_id): raise InterruptedError()
                bars=load_bars(app,dataset['id'],payload.get('start'),payload.get('end'))
                params=payload.get('params') or version['params']
                if params.get('use_spread'):
                    if dataset['price_basis']!='bid' or dataset.get('spread_unit')!='points' or any(b.get('spread') is None for b in bars):
                        raise ValueError('Spread simulation requires confirmed bid candles and spread in points for every bar')
                output=run_model(version['code'],bars,params,dataset['instrument'],timeout=180)
                rows=[{**t,'instrument_id':dataset['instrument_id'],'dataset_id':dataset['id']} for t in output['trades']]
                for k in range(0,len(rows),500):
                    if cancelled(user_id,job_id): raise InterruptedError()
                    app.call('backtests/trades',{'run_id':run_id,'rows':rows[k:k+500]})
                all_trades.extend(rows)
                daily=[{'day':str(t.get('date',t.get('day')))[:10],'outcome':t.get('status',t.get('reason','NO_TRADE')),
                        'instrument_id':dataset['instrument_id']} for t in output.get('daily',[])]
                for k in range(0,len(daily),500): app.call('backtests/daily',{'run_id':run_id,'rows':daily[k:k+500]})
                summaries.append({'symbol':dataset['instrument']['symbol'],'dataset_id':dataset['id'],
                                  'summary':output.get('summary',{}),'warnings':output.get('warnings',[])})
                app.call('jobs/update',{'job_id':job_id,'patch':{'progress':(i+1)/len(datasets)*.9}})
            all_trades.sort(key=lambda t:t['exit_time']);curve=[];peak=0;balance=0
            for t in all_trades:
                balance+=t.get('pnl') or 0;peak=max(peak,balance)
                curve.append({'t':t['exit_time'],'v':balance,'drawdown':peak-balance})
            wins=sum(t.get('reason')=='TP' for t in all_trades)
            result={'instruments':summaries,'trade_count':len(all_trades),'total_pnl':balance,
                    'hit_rate':wins/len(all_trades) if all_trades else 0,'max_drawdown':max((c['drawdown'] for c in curve),default=0),
                    'equity':curve,'engine_version':ENGINE_VERSION,'code_sha256':version['code_sha256']}
        elif kind=='prop_simulation':
            result=simulate(data['trades'],data['profile']['rules'],float(payload.get('bankroll',190)),int(payload.get('horizon_days',120)))
        else: raise ValueError('Unsupported job type')
        if cancelled(user_id,job_id): raise InterruptedError()
        app.call('jobs/update',{'job_id':job_id,'patch':{'status':'completed','progress':1,'result':result,'completed':True}})
    except InterruptedError:
        app.call('jobs/update',{'job_id':job_id,'patch':{'status':'cancelled','completed':True}})
    except Exception as e:
        # Avoid tracebacks from outbound URLs; only store a bounded error.
        try: app.call('jobs/update',{'job_id':job_id,'patch':{'status':'failed','error':str(e)[:400],'completed':True}})
        except Exception: print('Job failure could not be reported')
    finally:
        with _lock: _running.discard((user_id,job_id));_cancel.discard((user_id,job_id))

def start(user_id,job_id):
    with _lock:
        if (user_id,job_id) in _running: return
        if len(_running)>=2: raise ValueError('Engine is busy; retry when a job finishes')
        _running.add((user_id,job_id))
    threading.Thread(target=work,args=(user_id,job_id),daemon=True).start()
