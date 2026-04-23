"""Router for device posture baseline checks (mirrors identity_checks)."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user
from ..graph_client import get_graph_client
from ..models import User
from ..services.device_checks import (
    ALL_CHECKS,
    DEVICE_TEST_REFERENCES,
    build_summary,
    get_mock_results,
    run_all_checks,
    run_single_check,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/device-checks")


@router.get("/tests")
async def list_tests(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    tests = []
    for test_id, fn in ALL_CHECKS:
        tests.append({
            "id": test_id,
            "title": (fn.__doc__ or test_id).split("\n")[0].strip(),
            "reference": DEVICE_TEST_REFERENCES.get(test_id, {}),
        })
    return {"tests": tests, "total": len(tests)}


@router.post("/tests/run")
async def run_tests(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    client = get_graph_client()
    if not client.is_configured:
        logger.info("Graph not configured - returning mock device check results")
        results = get_mock_results()
        return {"is_mock": True, "summary": build_summary(results), "results": results}
    results = run_all_checks(client)
    return {"is_mock": False, "summary": build_summary(results), "results": results}


@router.post("/tests/{test_id}/run")
async def run_test(test_id: str, current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    client = get_graph_client()
    if not client.is_configured:
        for r in get_mock_results():
            if r["id"] == test_id:
                return {"is_mock": True, "result": r}
        raise HTTPException(status_code=404, detail=f"Unknown device test id: {test_id}")
    result = run_single_check(client, test_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown device test id: {test_id}")
    return {"is_mock": False, "result": result}


@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    client = get_graph_client()
    if not client.is_configured:
        return {"is_mock": True, "summary": build_summary(get_mock_results())}
    results = run_all_checks(client)
    return {"is_mock": False, "summary": build_summary(results)}
