"""
Device posture evaluation.

This module contains a simple stub for assessing device posture.  The
current implementation uses an HTTP header (`X-Device-Compliant`) to
determine whether the device is compliant.  If the header is set to
"true" and a device identifier is provided, the posture score is 100.
Otherwise, it is 0.  When integrating with Microsoft Intune, this
function should be replaced with Graph API calls to fetch the device
compliance state.
"""

from fastapi import Request


def get_posture_score(request: Request, device_id: str | None) -> float:
    """Compute a posture score for the given request and device.

    Args:
        request: Incoming HTTP request carrying headers.
        device_id: Identifier of the device being evaluated.  If
            ``None``, the device is treated as unknown/non-compliant.

    Returns:
        A float between 0 and 100 representing device posture.
    """

    compliant_hdr = request.headers.get("x-device-compliant", "").lower()
    if device_id and compliant_hdr == "true":
        return 100.0
    return 0.0