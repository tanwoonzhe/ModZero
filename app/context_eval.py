from datetime import datetime
from fastapi import Request

# simple MVP rules:
# - work hours 09:00–18:00 local => +40, else +20
# - if IP is private (LAN) => +60, else +40
# max context score 100

def is_private_ip(ip: str) -> bool:
    # naive check
    return ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("172.16.")

def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def evaluate_context(request: Request) -> tuple[float, str]:
    ip = get_client_ip(request)
    now = datetime.now()
    hour = now.hour

    time_score = 40.0 if 9 <= hour <= 18 else 20.0
    net_score  = 60.0 if is_private_ip(ip) else 40.0
    total = min(100.0, time_score + net_score)

    # (optional) add geo lookup later; for MVP we'll just return ip as "location"
    return total, ip
