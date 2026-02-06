"""Test Configuration API routes.

Provides endpoints for managing user test configurations:
- Get/update enabled/disabled status for tests
- Create/read/update/delete custom tests
- Update action status for tests
- Manage pillar weights
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User, UserTestConfiguration, PillarWeightConfiguration, DetectionModeEnum

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class GraphQueryConfigModel(BaseModel):
    endpoint: str
    useBeta: bool = False
    expectedField: str = "value"
    operator: str = "exists"
    value: str = ""
    filter: Optional[str] = None
    select: Optional[str] = None


class ChecklistItemModel(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    checked: bool = False


class ChecklistConfigModel(BaseModel):
    requireAll: bool = True
    items: List[ChecklistItemModel] = []


class TestConfigUpdate(BaseModel):
    """Model for updating test configuration."""
    is_enabled: Optional[bool] = None
    action_status: Optional[str] = None
    action_notes: Optional[str] = None
    weight_override: Optional[float] = None
    title: Optional[str] = None
    description: Optional[str] = None


class CustomTestCreate(BaseModel):
    """Model for creating a custom test."""
    title: str
    description: Optional[str] = None
    pillar: str  # identity, devices
    category: Optional[str] = None
    risk: Optional[str] = None  # high, medium, low
    detection_mode: str = "manual"  # manual, graph_query, checklist
    graph_query_config: Optional[GraphQueryConfigModel] = None
    checklist_config: Optional[ChecklistConfigModel] = None


class CustomTestUpdate(BaseModel):
    """Model for updating a custom test."""
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    risk: Optional[str] = None
    detection_mode: Optional[str] = None
    graph_query_config: Optional[GraphQueryConfigModel] = None
    checklist_config: Optional[ChecklistConfigModel] = None
    is_enabled: Optional[bool] = None
    action_status: Optional[str] = None
    action_notes: Optional[str] = None


class PillarWeightUpdate(BaseModel):
    """Model for updating pillar weights."""
    pillar: str
    weight: float


class BulkWeightUpdate(BaseModel):
    """Model for bulk updating pillar weights."""
    weights: Dict[str, float]  # pillar -> weight


# ============================================================================
# TEST CONFIGURATION ENDPOINTS
# ============================================================================

@router.get("/")
def get_all_test_configurations(
    pillar: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get all test configurations for the current user.
    
    Returns both default test overrides and custom tests.
    """
    query = db.query(UserTestConfiguration).filter(
        UserTestConfiguration.user_id == current_user.user_id
    )
    
    if pillar:
        query = query.filter(UserTestConfiguration.pillar == pillar.lower())
    
    configs = query.all()
    
    result = {
        "defaults": [],  # Overrides for default tests
        "customs": [],   # User-created custom tests
    }
    
    for config in configs:
        item = {
            "testId": config.test_id,
            "isEnabled": config.is_enabled,
            "actionStatus": config.action_status,
            "actionNotes": config.action_notes,
            "weightOverride": config.weight_override,
            "lastTestResult": config.last_test_result,
            "lastRunAt": config.last_run_at.isoformat() if config.last_run_at else None,
            "updatedAt": config.updated_at.isoformat() if config.updated_at else None,
        }
        
        if config.is_custom:
            item.update({
                "title": config.title,
                "description": config.description,
                "pillar": config.pillar,
                "category": config.category,
                "risk": config.risk,
                "detectionMode": config.detection_mode.value if config.detection_mode else "manual",
                "graphQueryConfig": config.graph_query_config,
                "checklistConfig": config.checklist_config,
                "lastRunData": config.last_run_data,
                "createdAt": config.created_at.isoformat() if config.created_at else None,
            })
            result["customs"].append(item)
        else:
            # Include title/description overrides for default tests too
            item["title"] = config.title
            item["description"] = config.description
            result["defaults"].append(item)
    
    return result


@router.get("/{test_id}")
def get_test_configuration(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get configuration for a specific test."""
    config = db.query(UserTestConfiguration).filter(
        UserTestConfiguration.user_id == current_user.user_id,
        UserTestConfiguration.test_id == test_id,
    ).first()
    
    if not config:
        return {
            "testId": test_id,
            "isEnabled": True,
            "actionStatus": "to_address",
            "exists": False,
        }
    
    result = {
        "testId": config.test_id,
        "isEnabled": config.is_enabled,
        "actionStatus": config.action_status,
        "actionNotes": config.action_notes,
        "weightOverride": config.weight_override,
        "lastTestResult": config.last_test_result,
        "lastRunAt": config.last_run_at.isoformat() if config.last_run_at else None,
        "exists": True,
    }
    
    if config.is_custom:
        result.update({
            "isCustom": True,
            "title": config.title,
            "description": config.description,
            "pillar": config.pillar,
            "category": config.category,
            "risk": config.risk,
            "detectionMode": config.detection_mode.value if config.detection_mode else "manual",
            "graphQueryConfig": config.graph_query_config,
            "checklistConfig": config.checklist_config,
            "lastRunData": config.last_run_data,
        })
    
    return result


@router.put("/{test_id}")
def update_test_configuration(
    test_id: str,
    update: TestConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update configuration for a default test.
    
    Creates a configuration record if it doesn't exist.
    """
    config = db.query(UserTestConfiguration).filter(
        UserTestConfiguration.user_id == current_user.user_id,
        UserTestConfiguration.test_id == test_id,
    ).first()
    
    if not config:
        # Create new configuration for this default test
        config = UserTestConfiguration(
            user_id=current_user.user_id,
            test_id=test_id,
            is_custom=False,
        )
        db.add(config)
    
    # Update fields if provided
    if update.is_enabled is not None:
        config.is_enabled = update.is_enabled
    if update.action_status is not None:
        config.action_status = update.action_status
    if update.action_notes is not None:
        config.action_notes = update.action_notes
    if update.weight_override is not None:
        config.weight_override = update.weight_override
    if update.title is not None:
        config.title = update.title
    if update.description is not None:
        config.description = update.description
    
    config.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(config)
    
    return {
        "testId": config.test_id,
        "isEnabled": config.is_enabled,
        "actionStatus": config.action_status,
        "actionNotes": config.action_notes,
        "weightOverride": config.weight_override,
        "title": config.title,
        "description": config.description,
        "updatedAt": config.updated_at.isoformat(),
    }


@router.post("/bulk-toggle")
def bulk_toggle_tests(
    test_ids: List[str],
    enabled: bool,
    pillar: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Bulk enable or disable multiple tests.
    
    If pillar is provided and test_ids is empty, affects all tests in that pillar.
    """
    updated_count = 0
    
    for test_id in test_ids:
        config = db.query(UserTestConfiguration).filter(
            UserTestConfiguration.user_id == current_user.user_id,
            UserTestConfiguration.test_id == test_id,
        ).first()
        
        if not config:
            config = UserTestConfiguration(
                user_id=current_user.user_id,
                test_id=test_id,
                is_custom=False,
                pillar=pillar,
            )
            db.add(config)
        
        config.is_enabled = enabled
        config.updated_at = datetime.now(timezone.utc)
        updated_count += 1
    
    db.commit()
    
    return {
        "updatedCount": updated_count,
        "enabled": enabled,
    }


# ============================================================================
# CUSTOM TEST ENDPOINTS
# ============================================================================

@router.post("/custom")
def create_custom_test(
    test: CustomTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a new custom test."""
    # Generate a unique test ID
    import time
    import random
    import string
    test_id = f"CUSTOM-{int(time.time())}-{''.join(random.choices(string.ascii_uppercase, k=5))}"
    
    # Parse detection mode
    detection_mode = None
    if test.detection_mode:
        try:
            detection_mode = DetectionModeEnum(test.detection_mode)
        except ValueError:
            detection_mode = DetectionModeEnum.MANUAL
    
    config = UserTestConfiguration(
        user_id=current_user.user_id,
        test_id=test_id,
        is_custom=True,
        title=test.title,
        description=test.description,
        pillar=test.pillar.lower() if test.pillar else None,
        category=test.category,
        risk=test.risk.lower() if test.risk else None,
        detection_mode=detection_mode,
        graph_query_config=test.graph_query_config.dict() if test.graph_query_config else None,
        checklist_config=test.checklist_config.dict() if test.checklist_config else None,
        is_enabled=True,
        action_status="to_address",
    )
    
    db.add(config)
    db.commit()
    db.refresh(config)
    
    return {
        "testId": config.test_id,
        "title": config.title,
        "description": config.description,
        "pillar": config.pillar,
        "category": config.category,
        "risk": config.risk,
        "detectionMode": config.detection_mode.value if config.detection_mode else "manual",
        "graphQueryConfig": config.graph_query_config,
        "checklistConfig": config.checklist_config,
        "isEnabled": config.is_enabled,
        "actionStatus": config.action_status,
        "createdAt": config.created_at.isoformat(),
    }


@router.put("/custom/{test_id}")
def update_custom_test(
    test_id: str,
    update: CustomTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update a custom test."""
    config = db.query(UserTestConfiguration).filter(
        UserTestConfiguration.user_id == current_user.user_id,
        UserTestConfiguration.test_id == test_id,
        UserTestConfiguration.is_custom == True,
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Custom test not found")
    
    # Update fields if provided
    if update.title is not None:
        config.title = update.title
    if update.description is not None:
        config.description = update.description
    if update.category is not None:
        config.category = update.category
    if update.risk is not None:
        config.risk = update.risk.lower() if update.risk else None
    if update.detection_mode is not None:
        try:
            config.detection_mode = DetectionModeEnum(update.detection_mode)
        except ValueError:
            pass
    if update.graph_query_config is not None:
        config.graph_query_config = update.graph_query_config.dict()
    if update.checklist_config is not None:
        config.checklist_config = update.checklist_config.dict()
    if update.is_enabled is not None:
        config.is_enabled = update.is_enabled
    if update.action_status is not None:
        config.action_status = update.action_status
    if update.action_notes is not None:
        config.action_notes = update.action_notes
    
    config.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(config)
    
    return {
        "testId": config.test_id,
        "title": config.title,
        "description": config.description,
        "pillar": config.pillar,
        "category": config.category,
        "risk": config.risk,
        "detectionMode": config.detection_mode.value if config.detection_mode else "manual",
        "graphQueryConfig": config.graph_query_config,
        "checklistConfig": config.checklist_config,
        "isEnabled": config.is_enabled,
        "actionStatus": config.action_status,
        "updatedAt": config.updated_at.isoformat(),
    }


@router.delete("/custom/{test_id}")
def delete_custom_test(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a custom test."""
    config = db.query(UserTestConfiguration).filter(
        UserTestConfiguration.user_id == current_user.user_id,
        UserTestConfiguration.test_id == test_id,
        UserTestConfiguration.is_custom == True,
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Custom test not found")
    
    db.delete(config)
    db.commit()
    
    return {
        "deleted": True,
        "testId": test_id,
    }


# ============================================================================
# PILLAR WEIGHT ENDPOINTS
# ============================================================================

@router.get("/weights/pillars")
def get_pillar_weights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get pillar weight configuration for the current user."""
    configs = db.query(PillarWeightConfiguration).filter(
        PillarWeightConfiguration.user_id == current_user.user_id
    ).all()
    
    # Default weights
    default_weights = {
        "identity": 25,
        "devices": 25,
        "data": 20,
        "apps": 15,
        "infrastructure": 15,
    }
    
    # Override with user's custom weights
    for config in configs:
        default_weights[config.pillar] = config.weight
    
    return {
        "weights": default_weights,
        "total": sum(default_weights.values()),
    }


@router.put("/weights/pillars")
def update_pillar_weights(
    update: BulkWeightUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update pillar weights for the current user."""
    for pillar, weight in update.weights.items():
        config = db.query(PillarWeightConfiguration).filter(
            PillarWeightConfiguration.user_id == current_user.user_id,
            PillarWeightConfiguration.pillar == pillar.lower(),
        ).first()
        
        if not config:
            config = PillarWeightConfiguration(
                user_id=current_user.user_id,
                pillar=pillar.lower(),
                weight=weight,
            )
            db.add(config)
        else:
            config.weight = weight
            config.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Return updated weights
    return get_pillar_weights(db=db, current_user=current_user)
