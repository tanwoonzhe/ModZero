"""API endpoints for Security Testing (Identity & Devices security tests).

This module provides endpoints for:
- Viewing security test definitions
- Running assessments
- Viewing results
- Managing overrides (admin only)
- Adding comments
- Creating remediation tasks (admin only)

PERMISSION MODEL:
- Regular users (employees): READ-ONLY access
  - Can view test definitions, results, comments
  - Can add comments to tests
  - Cannot modify test definitions, overrides, or tasks
  
- Admin users: FULL access
  - All permissions of regular users
  - Can modify test definitions
  - Can create/modify overrides
  - Can create/modify remediation tasks
  - Can trigger assessment runs
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_current_admin, get_db
from ..models import (
    User, RoleEnum,
    SecurityTestDefinition, SecurityTestResult, AssessmentRun,
    SecurityTestOverride, SecurityTestComment, RemediationTask,
    SecurityTestTypeEnum, TestStatusEnum, RiskLevelEnum
)
from ..schemas import (
    SecurityTestDefinitionOut, SecurityTestDefinitionCreate,
    SecurityTestResultOut, SecurityTestResultCreate,
    AssessmentRunOut, AssessmentRunCreate,
    SecurityTestOverrideOut, SecurityTestOverrideCreate,
    SecurityTestCommentOut, SecurityTestCommentCreate,
    RemediationTaskOut, RemediationTaskCreate, RemediationTaskUpdate,
    SecurityTestWithResult
)

router = APIRouter(prefix="/security-tests", tags=["Security Testing"])


# ============================================================================
# TEST DEFINITIONS - All users can read, only admins can modify
# ============================================================================

@router.get("/definitions", response_model=List[SecurityTestDefinitionOut])
def list_test_definitions(
    test_type: Optional[str] = Query(None, description="Filter by test type: identity or devices"),
    category: Optional[str] = Query(None, description="Filter by category"),
    risk: Optional[str] = Query(None, description="Filter by risk level: high, medium, low"),
    is_active: bool = Query(True, description="Filter by active status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all security test definitions.
    
    All users can access this endpoint.
    """
    query = db.query(SecurityTestDefinition)
    
    if test_type:
        query = query.filter(SecurityTestDefinition.test_type == test_type)
    if category:
        query = query.filter(SecurityTestDefinition.category == category)
    if risk:
        query = query.filter(SecurityTestDefinition.risk == risk)
    if is_active is not None:
        query = query.filter(SecurityTestDefinition.is_active == is_active)
    
    return query.order_by(SecurityTestDefinition.test_id).all()


@router.get("/definitions/{test_id}", response_model=SecurityTestDefinitionOut)
def get_test_definition(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific test definition by ID.
    
    All users can access this endpoint.
    """
    test = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == test_id
    ).first()
    
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test definition {test_id} not found"
        )
    
    return test


@router.post("/definitions", response_model=SecurityTestDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_test_definition(
    test_data: SecurityTestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Create a new test definition.
    
    ADMIN ONLY: Regular users cannot create test definitions.
    """
    existing = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == test_data.test_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Test definition {test_data.test_id} already exists"
        )
    
    test = SecurityTestDefinition(
        test_id=test_data.test_id,
        test_type=test_data.test_type,
        title=test_data.title,
        category=test_data.category,
        sfi_pillar=test_data.sfi_pillar,
        risk=test_data.risk,
        description=test_data.description,
        user_impact=test_data.user_impact,
        implementation_cost=test_data.implementation_cost,
        remediation_guidance=test_data.remediation_guidance,
        reference_url=test_data.reference_url
    )
    
    db.add(test)
    db.commit()
    db.refresh(test)
    
    return test


@router.put("/definitions/{test_id}", response_model=SecurityTestDefinitionOut)
def update_test_definition(
    test_id: str,
    test_data: SecurityTestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Update a test definition.
    
    ADMIN ONLY: Regular users cannot modify test definitions.
    """
    test = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == test_id
    ).first()
    
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test definition {test_id} not found"
        )
    
    for field, value in test_data.model_dump(exclude_unset=True).items():
        setattr(test, field, value)
    
    test.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(test)
    
    return test


# ============================================================================
# ASSESSMENT RUNS - View for all, trigger for admins only
# ============================================================================

@router.get("/runs", response_model=List[AssessmentRunOut])
def list_assessment_runs(
    test_type: Optional[str] = Query(None, description="Filter by test type"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List assessment runs.
    
    All users can view assessment run history.
    """
    query = db.query(AssessmentRun)
    
    if test_type:
        query = query.filter(AssessmentRun.test_type == test_type)
    
    return query.order_by(AssessmentRun.started_at.desc()).limit(limit).all()


@router.get("/runs/{run_id}", response_model=AssessmentRunOut)
def get_assessment_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific assessment run.
    
    All users can access this endpoint.
    """
    run = db.query(AssessmentRun).filter(AssessmentRun.run_id == run_id).first()
    
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment run not found"
        )
    
    return run


@router.post("/runs", response_model=AssessmentRunOut, status_code=status.HTTP_201_CREATED)
def trigger_assessment_run(
    run_data: AssessmentRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Trigger a new assessment run.
    
    ADMIN ONLY: Regular users cannot trigger assessments.
    This will connect to Microsoft Graph API and evaluate the tenant configuration.
    """
    from ..security_assessment_runner import SecurityAssessmentRunner
    import asyncio
    
    try:
        runner = SecurityAssessmentRunner(db)
        # Run the assessment synchronously for now
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        run = loop.run_until_complete(
            runner.run_assessment(run_data.test_type, str(current_user.user_id))
        )
        loop.close()
        return run
    except Exception as e:
        # Create a failed run record
        run = AssessmentRun(
            test_type=run_data.test_type,
            initiated_by=current_user.user_id,
            status="failed"
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assessment failed: {str(e)}"
        )


# ============================================================================
# TEST RESULTS - All users can read
# ============================================================================

@router.get("/results", response_model=List[SecurityTestResultOut])
def list_test_results(
    run_id: Optional[UUID] = Query(None, description="Filter by assessment run"),
    test_id: Optional[str] = Query(None, description="Filter by test ID"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List test results.
    
    All users can view test results.
    """
    query = db.query(SecurityTestResult)
    
    if run_id:
        query = query.filter(SecurityTestResult.assessment_run_id == run_id)
    if test_id:
        query = query.filter(SecurityTestResult.test_id == test_id)
    if status_filter:
        query = query.filter(SecurityTestResult.status == status_filter)
    
    return query.order_by(SecurityTestResult.evaluated_at.desc()).all()


@router.get("/results/latest", response_model=List[SecurityTestWithResult])
def get_latest_results(
    test_type: str = Query(..., description="Test type: identity or devices"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get latest results for all tests of a given type.
    
    This endpoint returns a combined view of test definitions with their
    latest results, which is optimized for frontend display.
    
    All users can access this endpoint.
    """
    # Get all test definitions of the specified type
    tests = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_type == test_type,
        SecurityTestDefinition.is_active == True
    ).all()
    
    # Get the latest assessment run
    latest_run = db.query(AssessmentRun).filter(
        AssessmentRun.test_type == test_type,
        AssessmentRun.status == "completed"
    ).order_by(AssessmentRun.completed_at.desc()).first()
    
    results = []
    for test in tests:
        # Get the latest result for this test
        latest_result = None
        if latest_run:
            latest_result = db.query(SecurityTestResult).filter(
                SecurityTestResult.test_id == test.test_id,
                SecurityTestResult.assessment_run_id == latest_run.run_id
            ).first()
        
        # Check for active override
        override = db.query(SecurityTestOverride).filter(
            SecurityTestOverride.test_id == test.test_id,
            SecurityTestOverride.is_active == True
        ).first()
        
        # Count comments
        comments_count = db.query(SecurityTestComment).filter(
            SecurityTestComment.test_id == test.test_id,
            SecurityTestComment.is_deleted == False
        ).count()
        
        # Check for remediation task
        has_task = db.query(RemediationTask).filter(
            RemediationTask.test_id == test.test_id,
            RemediationTask.status.in_(["open", "in_progress"])
        ).count() > 0
        
        results.append(SecurityTestWithResult(
            test_id=test.test_id,
            test_type=test.test_type.value if hasattr(test.test_type, 'value') else test.test_type,
            title=test.title,
            category=test.category,
            sfi_pillar=test.sfi_pillar,
            risk=test.risk.value if hasattr(test.risk, 'value') else test.risk,
            description=test.description,
            user_impact=test.user_impact,
            implementation_cost=test.implementation_cost,
            status=latest_result.status.value if latest_result and hasattr(latest_result.status, 'value') else (latest_result.status if latest_result else "planned"),
            test_result_detail=latest_result.test_result_detail if latest_result else None,
            has_override=override is not None,
            override_status=override.override_status if override else None,
            comments_count=comments_count,
            has_remediation_task=has_task
        ))
    
    return results


# ============================================================================
# OVERRIDES - Admin only for create/update, all users can read
# ============================================================================

@router.get("/overrides", response_model=List[SecurityTestOverrideOut])
def list_overrides(
    test_id: Optional[str] = Query(None, description="Filter by test ID"),
    is_active: bool = Query(True, description="Filter by active status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List test overrides.
    
    All users can view overrides (for transparency).
    """
    query = db.query(SecurityTestOverride)
    
    if test_id:
        query = query.filter(SecurityTestOverride.test_id == test_id)
    if is_active is not None:
        query = query.filter(SecurityTestOverride.is_active == is_active)
    
    return query.order_by(SecurityTestOverride.created_at.desc()).all()


@router.post("/overrides", response_model=SecurityTestOverrideOut, status_code=status.HTTP_201_CREATED)
def create_override(
    override_data: SecurityTestOverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Create a test override.
    
    ADMIN ONLY: Regular users cannot create overrides.
    
    Overrides allow admins to mark tests as accepted risk, not applicable,
    or in progress. A justification is required.
    """
    # Verify test exists
    test = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == override_data.test_id
    ).first()
    
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test {override_data.test_id} not found"
        )
    
    # Deactivate any existing active overrides for this test
    db.query(SecurityTestOverride).filter(
        SecurityTestOverride.test_id == override_data.test_id,
        SecurityTestOverride.is_active == True
    ).update({"is_active": False})
    
    override = SecurityTestOverride(
        test_id=override_data.test_id,
        override_status=override_data.override_status,
        justification=override_data.justification,
        created_by=current_user.user_id,
        expires_at=override_data.expires_at
    )
    
    db.add(override)
    db.commit()
    db.refresh(override)
    
    return override


@router.delete("/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_override(
    override_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Deactivate an override.
    
    ADMIN ONLY: Regular users cannot modify overrides.
    """
    override = db.query(SecurityTestOverride).filter(
        SecurityTestOverride.override_id == override_id
    ).first()
    
    if not override:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Override not found"
        )
    
    override.is_active = False
    override.updated_at = datetime.utcnow()
    db.commit()
    
    return None


# ============================================================================
# COMMENTS - All users can read and create, only admins can delete
# ============================================================================

@router.get("/comments", response_model=List[SecurityTestCommentOut])
def list_comments(
    test_id: str = Query(..., description="Filter by test ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted comments (admin only)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List comments for a test.
    
    All users can view comments.
    """
    query = db.query(SecurityTestComment).filter(
        SecurityTestComment.test_id == test_id
    )
    
    # Only admins can see deleted comments
    if not include_deleted or current_user.role != RoleEnum.ADMIN:
        query = query.filter(SecurityTestComment.is_deleted == False)
    
    return query.order_by(SecurityTestComment.created_at.desc()).all()


@router.post("/comments", response_model=SecurityTestCommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    comment_data: SecurityTestCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # All authenticated users
):
    """Create a comment on a test.
    
    All authenticated users can create comments.
    """
    # Verify test exists
    test = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == comment_data.test_id
    ).first()
    
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test {comment_data.test_id} not found"
        )
    
    comment = SecurityTestComment(
        test_id=comment_data.test_id,
        user_id=current_user.user_id,
        comment=comment_data.comment
    )
    
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Soft-delete a comment.
    
    Users can delete their own comments. Admins can delete any comment.
    """
    comment = db.query(SecurityTestComment).filter(
        SecurityTestComment.comment_id == comment_id
    ).first()
    
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Check permissions: user can only delete their own comments unless admin
    if current_user.role != RoleEnum.ADMIN and comment.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )
    
    comment.is_deleted = True
    comment.updated_at = datetime.utcnow()
    db.commit()
    
    return None


# ============================================================================
# REMEDIATION TASKS - Admin only for create/update, assigned users can view theirs
# ============================================================================

@router.get("/tasks", response_model=List[RemediationTaskOut])
def list_remediation_tasks(
    test_id: Optional[str] = Query(None, description="Filter by test ID"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    assigned_to_me: bool = Query(False, description="Show only tasks assigned to me"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List remediation tasks.
    
    Admins see all tasks. Regular users see tasks assigned to them
    or tasks they created.
    """
    query = db.query(RemediationTask)
    
    if test_id:
        query = query.filter(RemediationTask.test_id == test_id)
    if status_filter:
        query = query.filter(RemediationTask.status == status_filter)
    
    # For non-admins, restrict to tasks they can see
    if current_user.role != RoleEnum.ADMIN:
        query = query.filter(
            (RemediationTask.assigned_to == current_user.user_id) |
            (RemediationTask.created_by == current_user.user_id)
        )
    elif assigned_to_me:
        query = query.filter(RemediationTask.assigned_to == current_user.user_id)
    
    return query.order_by(RemediationTask.created_at.desc()).all()


@router.post("/tasks", response_model=RemediationTaskOut, status_code=status.HTTP_201_CREATED)
def create_remediation_task(
    task_data: RemediationTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Create a remediation task.
    
    ADMIN ONLY: Regular users cannot create remediation tasks.
    """
    # Verify test exists
    test = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_id == task_data.test_id
    ).first()
    
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test {task_data.test_id} not found"
        )
    
    task = RemediationTask(
        test_id=task_data.test_id,
        title=task_data.title,
        description=task_data.description,
        assigned_to=task_data.assigned_to,
        created_by=current_user.user_id,
        priority=task_data.priority,
        due_date=task_data.due_date
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return task


@router.put("/tasks/{task_id}", response_model=RemediationTaskOut)
def update_remediation_task(
    task_id: UUID,
    task_data: RemediationTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)  # Admin only
):
    """Update a remediation task.
    
    ADMIN ONLY: Regular users cannot modify remediation tasks.
    """
    task = db.query(RemediationTask).filter(
        RemediationTask.task_id == task_id
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    for field, value in task_data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    
    # If status changed to completed, set completed_at
    if task_data.status == "completed" and task.completed_at is None:
        task.completed_at = datetime.utcnow()
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    return task


# ============================================================================
# STATISTICS ENDPOINTS
# ============================================================================

@router.get("/stats/{test_type}")
def get_assessment_stats(
    test_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for a test type.
    
    All users can view statistics.
    """
    # Get total tests
    total = db.query(SecurityTestDefinition).filter(
        SecurityTestDefinition.test_type == test_type,
        SecurityTestDefinition.is_active == True
    ).count()
    
    # Get latest run
    latest_run = db.query(AssessmentRun).filter(
        AssessmentRun.test_type == test_type,
        AssessmentRun.status == "completed"
    ).order_by(AssessmentRun.completed_at.desc()).first()
    
    if not latest_run:
        return {
            "test_type": test_type,
            "total_tests": total,
            "last_run": None,
            "passed": 0,
            "failed": 0,
            "investigate": 0,
            "skipped": 0,
            "pass_rate": 0.0
        }
    
    # Count by status from latest run
    passed = db.query(SecurityTestResult).filter(
        SecurityTestResult.assessment_run_id == latest_run.run_id,
        SecurityTestResult.status == TestStatusEnum.PASSED
    ).count()
    
    failed = db.query(SecurityTestResult).filter(
        SecurityTestResult.assessment_run_id == latest_run.run_id,
        SecurityTestResult.status == TestStatusEnum.FAILED
    ).count()
    
    investigate = db.query(SecurityTestResult).filter(
        SecurityTestResult.assessment_run_id == latest_run.run_id,
        SecurityTestResult.status == TestStatusEnum.INVESTIGATE
    ).count()
    
    skipped = db.query(SecurityTestResult).filter(
        SecurityTestResult.assessment_run_id == latest_run.run_id,
        SecurityTestResult.status == TestStatusEnum.SKIPPED
    ).count()
    
    total_with_results = passed + failed + investigate + skipped
    pass_rate = (passed / total_with_results * 100) if total_with_results > 0 else 0
    
    return {
        "test_type": test_type,
        "total_tests": total,
        "last_run": latest_run.completed_at,
        "passed": passed,
        "failed": failed,
        "investigate": investigate,
        "skipped": skipped,
        "pass_rate": round(pass_rate, 1)
    }
