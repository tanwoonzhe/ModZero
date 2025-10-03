"""
MVP posture: stubbed logic. Replace with Graph/Intune:
- If device_id present and header X-Device-Compliant == "true" -> 100
- Else -> 0 (treat as non-compliant)
"""

from fastapi import Request

def get_posture_score(request: Request, device_id: str | None) -> float:
    compliant_hdr = request.headers.get("x-device-compliant", "").lower()
    if device_id and compliant_hdr == "true":
        return 100.0
    return 0.0
