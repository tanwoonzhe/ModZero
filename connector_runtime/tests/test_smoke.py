"""Network-free smoke test for connector_runtime.

Run:
    python connector_runtime/tests/test_smoke.py
"""

import os
import sys
import tempfile

# Ensure the package is importable when run as a plain script.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

failures = []


def check(label: str, cond: bool, detail: str = "") -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        failures.append(label)


# 1. Imports
try:
    from connector_runtime import __version__
    from connector_runtime.client import ControllerClient
    from connector_runtime.config import Config
    from connector_runtime.heartbeat import HeartbeatLoop
    from connector_runtime.logging_utils import redact, redact_url
    from connector_runtime.proxy import ProxyServer
    from connector_runtime.storage import load_state, save_state, state_exists
    from connector_runtime.wg import WgLoop
    check("imports", True, f"version={__version__}")
except Exception as exc:
    check("imports", False, str(exc))
    print("Aborting — imports failed.")
    sys.exit(1)

# 2. Config.load with no file
cfg = Config.load()
check("Config defaults — backend_url", cfg.backend_url == "http://localhost:8000",
      cfg.backend_url)
check("Config defaults — proxy_port type", isinstance(cfg.proxy_port, int),
      str(type(cfg.proxy_port)))
check("Config defaults — heartbeat_interval", cfg.heartbeat_interval == 10,
      str(cfg.heartbeat_interval))

# 3. Env var override
os.environ["MODZERO_BACKEND_URL"] = "http://example.test:9000/"
os.environ["MODZERO_PROXY_PORT"]  = "12345"
cfg2 = Config.load()
check("Env override — backend_url stripped trailing slash",
      cfg2.backend_url == "http://example.test:9000", cfg2.backend_url)
check("Env override — proxy_port int", cfg2.proxy_port == 12345, str(cfg2.proxy_port))
del os.environ["MODZERO_BACKEND_URL"]
del os.environ["MODZERO_PROXY_PORT"]

# 4. State round-trip
with tempfile.TemporaryDirectory() as td:
    path = os.path.join(td, "connector_state.json")
    check("state_exists=False before write", not state_exists(path))
    save_state(path, {"connector_id": "abc", "connector_secret": "xyz"})
    check("state_exists=True after write", state_exists(path))
    s = load_state(path)
    check("round-trip connector_id", s and s.get("connector_id") == "abc")
    check("round-trip connector_secret present", s and s.get("connector_secret") == "xyz")

# 5. ControllerClient constructs
c = ControllerClient("http://localhost:8000", "id", "secret")
check("ControllerClient constructs", c.backend == "http://localhost:8000")

# 6. ProxyServer constructs (does not start)
ps = ProxyServer("", 0)
check("ProxyServer constructs", ps.port == 0)

# 6b. WgLoop constructs (does not start)
wg = WgLoop(c, node_name="smoke-node", interval=10)
check("WgLoop constructs", wg.node_name == "smoke-node")

# 7. Redaction
check("redact() returns [REDACTED]", redact("real_token") == "[REDACTED]")
check("redact_url() strips token", "[REDACTED]" in redact_url("http://x/p?token=abc"))

# 7b. wg subparser smoke (read-only CLI helpers)
from connector_runtime.main import _build_parser, _WG_INSTRUCTIONS_TEMPLATE, _cmd_wg_detect
parser = _build_parser()
parser_ok = True
try:
    ns_status = parser.parse_args(["wg", "status"])
    ns_instr = parser.parse_args(["wg", "instructions"])
    parser_ok = (
        ns_status.command == "wg" and ns_status.wg_command == "status"
        and ns_instr.command == "wg" and ns_instr.wg_command == "instructions"
    )
except SystemExit:
    parser_ok = False
check("parser accepts 'wg status' and 'wg instructions'", parser_ok)

check(
    "wg instructions template — manual phrase present",
    "Run this command manually" in _WG_INSTRUCTIONS_TEMPLATE,
)
check(
    "wg instructions template — no baked-in --authkey",
    "--authkey=" not in _WG_INSTRUCTIONS_TEMPLATE,
)

# 8b. wg detect — parser, exit-0, output
detect_parser_ok = False
try:
    ns_detect = parser.parse_args(["wg", "detect"])
    detect_parser_ok = (
        ns_detect.command == "wg" and ns_detect.wg_command == "detect"
    )
except SystemExit:
    pass
check("parser accepts 'wg detect'", detect_parser_ok)

_saved_path = os.environ.get("PATH", "")
try:
    os.environ["PATH"] = ""
    ret = _cmd_wg_detect(None, Config.load())
    check("wg detect exits 0 when tailscale not installed", ret == 0)
finally:
    os.environ["PATH"] = _saved_path

import io
from contextlib import redirect_stdout
buf = io.StringIO()
_saved_path2 = os.environ.get("PATH", "")
try:
    os.environ["PATH"] = ""
    with redirect_stdout(buf):
        _cmd_wg_detect(None, Config.load())
finally:
    os.environ["PATH"] = _saved_path2
check("wg detect output contains 'status'", "status" in buf.getvalue())

# 9. Summary
print()
if failures:
    print(f"FAILED: {len(failures)}  ({', '.join(failures)})")
    sys.exit(1)
print("All smoke checks passed.")
