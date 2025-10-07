"""Policy management endpoints."""

from typing import List, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_admin

from datetime import datetime


router = APIRouter()


@router.get("/", response_model=List[schemas.PolicyOut])
def list_policies(
    db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Return all policies."""
    policies = db.query(models.Policy).all()
    results: list[schemas.PolicyOut] = []
    for p in policies:
        weights = {pw.factor.name: pw.weight for pw in p.factor_weights}
        results.append(
            schemas.PolicyOut(
                policy_id=str(p.policy_id),
                user_id=str(p.user_id),
                policy_name=p.policy_name,
                min_trust_threshold=p.min_trust_threshold,
                description=p.description,
                target_group=p.target_group,
                created_at=p.created_at,
                updated_at=p.updated_at,
                is_active=p.is_active,
                weights=weights,
            )
        )
    return results


@router.post("/", response_model=schemas.PolicyOut, status_code=status.HTTP_201_CREATED)
def create_policy(
    policy_in: schemas.PolicyCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    """Create a new policy and optional factor weights."""
    if db.query(models.Policy).filter(models.Policy.policy_name == policy_in.policy_name).first():
        raise HTTPException(status_code=400, detail="Policy name already exists")
    # Create policy
    policy = models.Policy(
        user_id=current_admin.user_id,
        policy_name=policy_in.policy_name,
        min_trust_threshold=policy_in.min_trust_threshold,
        description=policy_in.description,
        target_group=policy_in.target_group,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    # Handle factor weights
    if policy_in.factor_weights:
        for factor_name, weight in policy_in.factor_weights.items():
            factor = db.query(models.TrustFactor).filter(models.TrustFactor.name == factor_name).first()
            if not factor:
                factor = models.TrustFactor(name=factor_name, description=factor_name)
                db.add(factor)
                db.commit()
                db.refresh(factor)
            pfw = models.PolicyFactorWeight(
                policy_id=policy.policy_id, factor_id=factor.factor_id, weight=weight
            )
            db.add(pfw)
        db.commit()
    # Return created policy with weights
    weights = {pw.factor.name: pw.weight for pw in policy.factor_weights}
    return schemas.PolicyOut(
        policy_id=str(policy.policy_id),
        user_id=str(policy.user_id),
        policy_name=policy.policy_name,
        min_trust_threshold=policy.min_trust_threshold,
        description=policy.description,
        target_group=policy.target_group,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
        is_active=policy.is_active,
        weights=weights,
    )


@router.get("/{policy_id}", response_model=schemas.PolicyOut)
def get_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    policy = db.query(models.Policy).filter(models.Policy.policy_id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    weights = {pw.factor.name: pw.weight for pw in policy.factor_weights}
    return schemas.PolicyOut(
        policy_id=str(policy.policy_id),
        user_id=str(policy.user_id),
        policy_name=policy.policy_name,
        min_trust_threshold=policy.min_trust_threshold,
        description=policy.description,
        target_group=policy.target_group,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
        is_active=policy.is_active,
        weights=weights,
    )


@router.put("/{policy_id}", response_model=schemas.PolicyOut)
def update_policy(
    policy_id: str,
    policy_in: schemas.PolicyCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    policy = db.query(models.Policy).filter(models.Policy.policy_id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    # Update basic fields
    policy.policy_name = policy_in.policy_name
    policy.min_trust_threshold = policy_in.min_trust_threshold
    policy.description = policy_in.description
    policy.target_group = policy_in.target_group
    policy.updated_at = datetime.utcnow()
    # Remove existing factor weights
    db.query(models.PolicyFactorWeight).filter(models.PolicyFactorWeight.policy_id == policy_id).delete()
    db.commit()
    # Insert new factor weights
    if policy_in.factor_weights:
        for factor_name, weight in policy_in.factor_weights.items():
            factor = db.query(models.TrustFactor).filter(models.TrustFactor.name == factor_name).first()
            if not factor:
                factor = models.TrustFactor(name=factor_name, description=factor_name)
                db.add(factor)
                db.commit()
                db.refresh(factor)
            pfw = models.PolicyFactorWeight(
                policy_id=policy.policy_id, factor_id=factor.factor_id, weight=weight
            )
            db.add(pfw)
    db.commit()
    db.refresh(policy)
    weights = {pw.factor.name: pw.weight for pw in policy.factor_weights}
    return schemas.PolicyOut(
        policy_id=str(policy.policy_id),
        user_id=str(policy.user_id),
        policy_name=policy.policy_name,
        min_trust_threshold=policy.min_trust_threshold,
        description=policy.description,
        target_group=policy.target_group,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
        is_active=policy.is_active,
        weights=weights,
    )


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> None:
    policy = db.query(models.Policy).filter(models.Policy.policy_id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(policy)
    db.commit()
    return None