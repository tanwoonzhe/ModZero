"""Custom Policies API routes.

Provides CRUD endpoints for customer-defined security policies.
Policies define enforcement rules, scope, and thresholds — NOT detection logic.

Built-in Baseline Checks = read-only Microsoft-inspired assessment checks
Custom Tests            = user-defined executable checks (Graph API / Checklist / Manual)
Custom Policies         = enforcement rules, scope, thresholds, and organizational interpretation
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User, CustomPolicy, EnforcementModeEnum
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
    """Create a new custom policy.

    Policies define enforcement rules and thresholds.  Detection logic
    (Graph API queries, checklists) belongs in Custom Tests.
    """
    try:
        enforcement = EnforcementModeEnum(data.enforcement_mode)
    except ValueError:
        enforcement = EnforcementModeEnum.INFORMATIONAL

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
    """Update an existing custom policy.

    Only enforcement-related fields can be changed.  Detection logic
    (Graph API queries, checklists) is managed via Custom Tests.
    """
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
