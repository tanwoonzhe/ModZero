"""Custom Policies API routes.

Provides CRUD endpoints for customer-defined security policies/tests.
These are separate from built-in Microsoft-inspired baseline checks.

Built-in checks = recommended posture/security assessment (read-only reference)
Custom policies = customer-specific enforced rules or thresholds (full CRUD)
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User, CustomPolicy, EnforcementModeEnum, DetectionModeEnum
from ..schemas import CustomPolicyCreate, CustomPolicyUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


def _policy_to_dict(policy: CustomPolicy) -> Dict[str, Any]:
    """Convert a CustomPolicy ORM object to a JSON-serialisable dict."""
    return {
        "policyId": str(policy.policy_id),
        "title": policy.title,
        "description": policy.description,
        "pillar": policy.pillar,
        "category": policy.category,
        "module": policy.module,
        "scope": policy.scope,
        "enforcementMode": policy.enforcement_mode.value if policy.enforcement_mode else "informational",
        "isEnabled": policy.is_enabled,
        "risk": policy.risk,
        "severity": policy.severity,
        "detectionMode": policy.detection_mode.value if policy.detection_mode else None,
        "graphQueryConfig": policy.graph_query_config,
        "checklistConfig": policy.checklist_config,
        "thresholdConfig": policy.threshold_config,
        "lastTestResult": policy.last_test_result,
        "lastRunAt": policy.last_run_at.isoformat() if policy.last_run_at else None,
        "lastRunData": policy.last_run_data,
        "createdBy": str(policy.created_by),
        "createdAt": policy.created_at.isoformat() if policy.created_at else None,
        "updatedAt": policy.updated_at.isoformat() if policy.updated_at else None,
    }


# ============================================================================
# LIST / GET
# ============================================================================

@router.get("/")
def list_custom_policies(
    pillar: Optional[str] = Query(None, description="Filter by pillar (identity, devices, etc.)"),
    enforcement_mode: Optional[str] = Query(None, description="Filter by enforcement mode"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """List all custom policies for the current user."""
    query = db.query(CustomPolicy).filter(
        CustomPolicy.created_by == current_user.user_id
    )

    if pillar:
        query = query.filter(CustomPolicy.pillar == pillar.lower())
    if enforcement_mode:
        try:
            mode = EnforcementModeEnum(enforcement_mode)
            query = query.filter(CustomPolicy.enforcement_mode == mode)
        except ValueError:
            pass

    policies = query.order_by(CustomPolicy.created_at.desc()).all()

    return {
        "policies": [_policy_to_dict(p) for p in policies],
        "total": len(policies),
    }


@router.get("/{policy_id}")
def get_custom_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get a single custom policy by ID."""
    policy = db.query(CustomPolicy).filter(
        CustomPolicy.policy_id == policy_id,
        CustomPolicy.created_by == current_user.user_id,
    ).first()

    if not policy:
        raise HTTPException(status_code=404, detail="Custom policy not found")

    return _policy_to_dict(policy)


# ============================================================================
# CREATE
# ============================================================================

@router.post("/", status_code=201)
def create_custom_policy(
    data: CustomPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a new custom policy."""
    # Parse enums
    try:
        enforcement = EnforcementModeEnum(data.enforcement_mode)
    except ValueError:
        enforcement = EnforcementModeEnum.INFORMATIONAL

    detection = None
    if data.detection_mode:
        try:
            detection = DetectionModeEnum(data.detection_mode)
        except ValueError:
            detection = DetectionModeEnum.MANUAL

    policy = CustomPolicy(
        title=data.title,
        description=data.description,
        pillar=data.pillar.lower() if data.pillar else "identity",
        category=data.category,
        module=data.module,
        scope=data.scope,
        enforcement_mode=enforcement,
        is_enabled=data.is_enabled,
        risk=data.risk.lower() if data.risk else None,
        severity=data.severity.lower() if data.severity else None,
        detection_mode=detection,
        graph_query_config=data.graph_query_config,
        checklist_config=data.checklist_config,
        threshold_config=data.threshold_config,
        created_by=current_user.user_id,
    )

    db.add(policy)
    db.commit()
    db.refresh(policy)

    return _policy_to_dict(policy)


# ============================================================================
# UPDATE
# ============================================================================

@router.put("/{policy_id}")
def update_custom_policy(
    policy_id: UUID,
    data: CustomPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update an existing custom policy."""
    policy = db.query(CustomPolicy).filter(
        CustomPolicy.policy_id == policy_id,
        CustomPolicy.created_by == current_user.user_id,
    ).first()

    if not policy:
        raise HTTPException(status_code=404, detail="Custom policy not found")

    if data.title is not None:
        policy.title = data.title
    if data.description is not None:
        policy.description = data.description
    if data.pillar is not None:
        policy.pillar = data.pillar.lower()
    if data.category is not None:
        policy.category = data.category
    if data.module is not None:
        policy.module = data.module
    if data.scope is not None:
        policy.scope = data.scope
    if data.enforcement_mode is not None:
        try:
            policy.enforcement_mode = EnforcementModeEnum(data.enforcement_mode)
        except ValueError:
            pass
    if data.is_enabled is not None:
        policy.is_enabled = data.is_enabled
    if data.risk is not None:
        policy.risk = data.risk.lower()
    if data.severity is not None:
        policy.severity = data.severity.lower()
    if data.detection_mode is not None:
        try:
            policy.detection_mode = DetectionModeEnum(data.detection_mode)
        except ValueError:
            pass
    if data.graph_query_config is not None:
        policy.graph_query_config = data.graph_query_config
    if data.checklist_config is not None:
        policy.checklist_config = data.checklist_config
    if data.threshold_config is not None:
        policy.threshold_config = data.threshold_config

    policy.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(policy)

    return _policy_to_dict(policy)


# ============================================================================
# DELETE
# ============================================================================

@router.delete("/{policy_id}")
def delete_custom_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a custom policy."""
    policy = db.query(CustomPolicy).filter(
        CustomPolicy.policy_id == policy_id,
        CustomPolicy.created_by == current_user.user_id,
    ).first()

    if not policy:
        raise HTTPException(status_code=404, detail="Custom policy not found")

    db.delete(policy)
    db.commit()

    return {"deleted": True, "policyId": str(policy_id)}


# ============================================================================
# BULK OPERATIONS
# ============================================================================

@router.post("/bulk-toggle")
def bulk_toggle_policies(
    policy_ids: List[UUID],
    enabled: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Bulk enable or disable multiple custom policies."""
    updated = 0
    for pid in policy_ids:
        policy = db.query(CustomPolicy).filter(
            CustomPolicy.policy_id == pid,
            CustomPolicy.created_by == current_user.user_id,
        ).first()
        if policy:
            policy.is_enabled = enabled
            policy.updated_at = datetime.now(timezone.utc)
            updated += 1

    db.commit()
    return {"updatedCount": updated, "enabled": enabled}


# ============================================================================
# RUN POLICY CHECK
# ============================================================================

@router.post("/{policy_id}/run")
def run_custom_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run a single custom policy check.
    
    Delegates to the custom_test_evaluator for graph_query and checklist modes.
    Manual policies must be resolved by the user.
    """
    policy = db.query(CustomPolicy).filter(
        CustomPolicy.policy_id == policy_id,
        CustomPolicy.created_by == current_user.user_id,
    ).first()

    if not policy:
        raise HTTPException(status_code=404, detail="Custom policy not found")

    if not policy.detection_mode or policy.detection_mode == DetectionModeEnum.MANUAL:
        raise HTTPException(
            status_code=400,
            detail="Manual policies cannot be auto-run. Set the result manually.",
        )

    # Import evaluator
    from ..custom_test_evaluator import evaluate_graph_response, evaluate_checklist

    now = datetime.now(timezone.utc)
    result: Dict[str, Any] = {}

    if policy.detection_mode == DetectionModeEnum.GRAPH_QUERY:
        if not policy.graph_query_config:
            raise HTTPException(status_code=400, detail="Graph query config missing")

        # Try to call Graph API
        try:
            from ..graph_client import get_graph_client
            graph = get_graph_client()
            config = policy.graph_query_config
            endpoint = config.get("endpoint", "")
            use_beta = config.get("useBeta", False)
            api_version = "beta" if use_beta else "v1.0"
            url = f"https://graph.microsoft.com/{api_version}{endpoint}"

            params = {}
            if config.get("filter"):
                params["$filter"] = config["filter"]
            if config.get("select"):
                params["$select"] = config["select"]

            import httpx
            token = graph.get_token()
            resp = httpx.get(url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=30)
            resp.raise_for_status()
            graph_data = resp.json()

            eval_result = evaluate_graph_response(graph_data, config)
            result = {
                "status": "passed" if eval_result.passed else "failed",
                "details": eval_result.details,
                "rawData": eval_result.raw_data,
                "evaluatedValue": str(eval_result.evaluated_value) if eval_result.evaluated_value is not None else None,
                "timestamp": now.isoformat(),
            }
        except ImportError:
            result = {
                "status": "error",
                "details": "Graph client not configured",
                "timestamp": now.isoformat(),
            }
        except Exception as e:
            logger.error(f"Error running custom policy graph query: {e}")
            result = {
                "status": "error",
                "details": str(e),
                "timestamp": now.isoformat(),
            }

    elif policy.detection_mode == DetectionModeEnum.CHECKLIST:
        if not policy.checklist_config:
            raise HTTPException(status_code=400, detail="Checklist config missing")

        eval_result = evaluate_checklist(policy.checklist_config)
        result = {
            "status": "passed" if eval_result.passed else "failed",
            "details": eval_result.details,
            "timestamp": now.isoformat(),
        }

    # Persist result
    policy.last_test_result = result.get("status", "error")
    policy.last_run_at = now
    policy.last_run_data = result
    policy.updated_at = now
    db.commit()
    db.refresh(policy)

    return result
