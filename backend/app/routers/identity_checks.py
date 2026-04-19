"""Router for Zero Trust Assessment identity checks.

Provides endpoints to run the 5 selected identity security checks
against Microsoft Graph API, or return mock data when Graph is not configured.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user
from ..graph_client import get_graph_client, GraphClient
from ..models import User
from ..services.identity_checks import (
    ALL_CHECKS,
    build_summary,
    get_mock_results,
    run_all_checks,
    run_single_check,
)
from ..services.identity_tests.reference_loader import get_reference_for_result

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/identity-checks")


@router.get("/tests")
async def list_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return metadata for all implemented identity checks (no execution)."""
    tests = []
    for test_id, fn in ALL_CHECKS:
        ref = get_reference_for_result(test_id)
        tests.append({
            "id": test_id,
            "title": fn.__doc__.split("\n")[0] if fn.__doc__ else test_id,
            "reference": ref,
        })
    return {"tests": tests, "total": len(tests)}


@router.post("/tests/run")
async def run_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run all identity checks and return results + summary.

    If Azure Graph credentials are not configured, returns mock results
    with a flag ``is_mock: true`` so the UI can indicate demo mode.
    """
    client = get_graph_client()

    if not client.is_configured:
        logger.info("Graph not configured – returning mock identity check results")
        results = get_mock_results()
        summary = build_summary(results)
        return {"is_mock": True, "summary": summary, "results": results}

    results = run_all_checks(client)
    summary = build_summary(results)
    return {"is_mock": False, "summary": summary, "results": results}


@router.post("/tests/{test_id}/run")
async def run_test(
    test_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run a single identity check by its ID.

    Returns mock data for that test if Graph is not configured.
    """
    client = get_graph_client()

    if not client.is_configured:
        logger.info(f"Graph not configured – returning mock result for {test_id}")
        mock = get_mock_results()
        result = next((r for r in mock if r["id"] == test_id), None)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Test {test_id} not found")
        return {"is_mock": True, "result": result}

    result = run_single_check(client, test_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Test {test_id} not found")
    return {"is_mock": False, "result": result}


@router.get("/summary")
async def get_summary(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return a quick summary without re-running tests.

    Runs all checks (live or mock) and returns the summary object.
    """
    client = get_graph_client()

    if not client.is_configured:
        results = get_mock_results()
        summary = build_summary(results)
        return {"is_mock": True, "summary": summary}

    results = run_all_checks(client)
    summary = build_summary(results)
    return {"is_mock": False, "summary": summary}
