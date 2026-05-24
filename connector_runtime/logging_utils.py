"""Token-redacting log helpers (mirrors tools/connector_sim.py styling)."""

import sys
from datetime import datetime
from urllib.parse import parse_qs, urlparse

RESET  = "\033[0m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
DIM    = "\033[2m"


def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _p(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"))
    sys.stdout.flush()


def info(msg: str)   -> None: _p(f"[{_ts()}] {msg}")
def ok(msg: str)     -> None: _p(f"[{_ts()}] {GREEN}OK{RESET}  {msg}")
def warn(msg: str)   -> None: _p(f"[{_ts()}] {YELLOW}WN{RESET}  {msg}")
def error(msg: str)  -> None: _p(f"[{_ts()}] {RED}ERR{RESET} {msg}")
def header(msg: str) -> None: _p(f"\n{BOLD}=== {msg} ==={RESET}\n")


def redact(_value: str) -> str:
    """Always return [REDACTED]. Never log raw secrets/tokens."""
    return "[REDACTED]"


def redact_url(url: str) -> str:
    """Redact ?token=... in a URL for logging."""
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        if "token" in qs:
            return parsed.path + "?token=[REDACTED]"
        return parsed.path or url
    except Exception:
        return "[unparseable-url]"
