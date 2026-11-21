import ctypes.util,hashlib
from pathlib import Path
import pytest
from app.sandbox import run_model,REFERENCE_HASH

def test_reference_hash():
 assert hashlib.sha256(Path('app/orb_reference.py').read_bytes()).hexdigest()==REFERENCE_HASH

def test_fail_closed_without_seccomp():
 if ctypes.util.find_library('seccomp'): pytest.skip('seccomp available')
 with pytest.raises(ValueError,match='sandbox is unavailable'):
  run_model('META={}\ndef on_bar(ctx,bar): return []',[{'ts_utc':'2026-06-01T00:00:00Z','open':1,'high':2,'low':.5,'close':1}],{}, {})

@pytest.mark.skipif(not ctypes.util.find_library('seccomp'),reason='development host has no seccomp')
def test_no_files():
 code="META={}\ndef on_bar(ctx,bar):\n open('/etc/passwd').read()\n return []"
 with pytest.raises(ValueError,match='permitted'):
  run_model(code,[{'ts_utc':'2026-06-01T00:00:00Z','open':1,'high':2,'low':.5,'close':1}],{}, {})
