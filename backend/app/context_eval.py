"""
Context analysis for access attempts.

This module provides a simple risk assessment based on the IP address
and time of access.  The heuristic awards more points for requests
originating from private networks during typical business hours.  It
returns both a context score and the detected client IP.  Future
enhancements could include GeoIP lookups, user behavior patterns, or
integration with Azure AD sign-in risk signals.
"""

from datetime import datetime
from fastapi import Request


def is_private_ip(ip: str) -> bool:
    """Return True if the given IP address is from a private range."""

    return ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("172.16.")


def get_client_ip(request: Request) -> str:
    """Extract the originating IP address from request headers.

    Checks the `X-Forwarded-For` header if present; otherwise falls
    back to the client host reported by Starlette.  Returns
    ``"0.0.0.0"`` if the address cannot be determined.
    """

    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def evaluate_context(request: Request) -> tuple[float, str]:
    """Compute a context score and return the client IP.

    The score ranges from 0 to 100 based on time of day and whether
    the IP is private.  Office hours are assumed to be 09:00–18:00
    local time.  Private network traffic and in-hours access yield
    higher scores.
    """

    ip = get_client_ip(request)
    now = datetime.now()
    hour = now.hour

    time_score = 40.0 if 9 <= hour <= 18 else 20.0
    net_score = 60.0 if is_private_ip(ip) else 40.0
    total = min(100.0, time_score + net_score)

    return total, ip