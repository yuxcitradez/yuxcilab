"""Independent, secret-free, resource-limited processes. Untrusted code fails closed without seccomp."""
from __future__ import annotations
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
from . import orb_reference
REFERENCE_HASH=hashlib.sha256(Path(orb_reference.__file__).read_bytes()).hexdigest()

def run_model(code: str, bars: list[dict], params: dict, spec: dict, engine='A', timeout=90) -> dict:
    payload={'code':code,'bars':bars,'params':params,'spec':spec,'engine':engine}
    # Preserve only interpreter configuration. No Engine token, market key, inherited sockets, or DB credentials.
    clean={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'PYTHONPATH':str(Path(__file__).resolve().parents[1]),
           'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','PYTHONDONTWRITEBYTECODE':'1'}
    with tempfile.TemporaryDirectory() as cwd:
        try:
            result=subprocess.run([sys.executable,'-m','app.sandbox_worker'],input=json.dumps(payload),text=True,
                capture_output=True,cwd=cwd,env=clean,timeout=timeout,close_fds=True)
        except subprocess.TimeoutExpired:
            raise ValueError('Model exceeded the execution time limit') from None
    if result.returncode!=0: raise ValueError('Model process stopped: security policy or resource limit')
    if len(result.stdout)>20_000_000: raise ValueError('Model output limit exceeded')
    try: output=json.loads(result.stdout)
    except ValueError: raise ValueError('Invalid model output') from None
    if 'error' in output: raise ValueError(output['error'])
    return output
