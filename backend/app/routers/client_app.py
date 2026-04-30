"""Desktop client distribution endpoints.

Serves prebuilt installers from ``backend/app/static/client/`` if present.
The folder is auto-discovered by glob so no manual config is needed:
- ``*.exe`` / ``*.msi``           -> Windows
- ``*.dmg`` / ``*.pkg``           -> macOS
- ``*.AppImage`` / ``*.deb`` / ``*.rpm`` -> Linux

If a platform has no artifact yet, ``/api/client-app/info`` reports it as
``available: false`` and the UI shows build-from-source instructions.
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/client-app", tags=["client-app"])

# backend/app/static/client/
CLIENT_DIR = Path(__file__).resolve().parent.parent / "static" / "client"

PLATFORM_GLOBS: Dict[str, List[str]] = {
    "win": ["*.exe", "*.msi", "ModZero-win*.zip"],
    "mac": ["*.dmg", "*.pkg", "ModZero-mac*.zip"],
    "linux": ["*.AppImage", "*.deb", "*.rpm", "*.tar.gz"],
}

PLATFORM_LABEL: Dict[str, str] = {
    "win": "Windows",
    "mac": "macOS",
    "linux": "Linux",
}


def _find_artifact(platform: str) -> Optional[Path]:
    if platform not in PLATFORM_GLOBS or not CLIENT_DIR.exists():
        return None
    for pattern in PLATFORM_GLOBS[platform]:
        matches = sorted(CLIENT_DIR.glob(pattern))
        if matches:
            # Pick the most recently modified to handle multi-version drops.
            matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return matches[0]
    return None


class PlatformInfo(BaseModel):
    platform: str
    label: str
    available: bool
    filename: Optional[str] = None
    size_bytes: Optional[int] = None
    download_url: Optional[str] = None


class ClientAppInfo(BaseModel):
    version: str = "1.0.0"
    platforms: List[PlatformInfo]
    source_path: str = "electron-client"
    dev_instructions: List[str]


@router.get("/info", response_model=ClientAppInfo)
def client_app_info() -> ClientAppInfo:
    platforms: List[PlatformInfo] = []
    for key, label in PLATFORM_LABEL.items():
        artifact = _find_artifact(key)
        if artifact is not None:
            platforms.append(
                PlatformInfo(
                    platform=key,
                    label=label,
                    available=True,
                    filename=artifact.name,
                    size_bytes=artifact.stat().st_size,
                    download_url=f"/api/client-app/download?platform={key}",
                )
            )
        else:
            platforms.append(
                PlatformInfo(platform=key, label=label, available=False)
            )

    return ClientAppInfo(
        platforms=platforms,
        dev_instructions=[
            "cd electron-client",
            "npm install",
            "npm run build:main",
            "npm run dev          # in one terminal (Vite + tsc watch)",
            "npm run electron     # in a second terminal (launches the app)",
            "",
            "# To produce a Windows portable .zip (no admin / no Dev Mode needed):",
            "npm run package:zip:win   # auto-publishes to backend/app/static/client/",
            "",
            "# Or full installers via electron-builder (requires Windows Developer Mode",
            "# OR an elevated PowerShell, due to symlinks in winCodeSign-2.6.0.7z):",
            "npm run package:win  # NSIS .exe + portable .exe",
            "npm run package:mac  # .dmg",
            "npm run package:linux  # .AppImage + .deb",
            "# Drop the resulting file into backend/app/static/client/ to enable",
            "# the Settings page download button.",
        ],
    )


@router.get("/download")
def client_app_download(
    platform: str = Query(..., regex="^(win|mac|linux)$"),
):
    artifact = _find_artifact(platform)
    if artifact is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No {PLATFORM_LABEL[platform]} installer is published yet. "
                "Build one with `npm run package:"
                + platform
                + "` from the electron-client/ directory and drop the file "
                "into backend/app/static/client/."
            ),
        )
    media_type, _ = mimetypes.guess_type(artifact.name)
    return FileResponse(
        path=str(artifact),
        media_type=media_type or "application/octet-stream",
        filename=artifact.name,
    )
