"""Azure integration endpoints."""

from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_admin
from ..azure_service import azure_service

router = APIRouter()


@router.get("/test-connection")
def test_azure_connection(
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Test Azure AD connection (admin only)."""
    try:
        result = azure_service.test_connection()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test Azure connection: {str(e)}"
        )


@router.get("/users")
def get_azure_users(
    top: int = 100,
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Fetch users from Azure AD (admin only).
    
    Args:
        top: Maximum number of users to fetch (default 100, max 999)
    """
    if top > 999:
        top = 999
        
    try:
        users = azure_service.get_users(top=top)
        
        # Transform Azure user data to a more frontend-friendly format
        transformed_users = []
        for user in users:
            transformed_user = {
                "azure_id": user.get("id"),
                "display_name": user.get("displayName", ""),
                "email": user.get("mail") or user.get("userPrincipalName", ""),
                "username": user.get("userPrincipalName", ""),
                "job_title": user.get("jobTitle", ""),
                "department": user.get("department", ""),
                "office_location": user.get("officeLocation", ""),
                "mobile_phone": user.get("mobilePhone", ""),
                "business_phones": user.get("businessPhones", []),
                "account_enabled": user.get("accountEnabled", False),
                "is_synced": False  # We'll check if user exists locally
            }
            transformed_users.append(transformed_user)
        
        return {
            "total": len(transformed_users),
            "users": transformed_users
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Azure users: {str(e)}"
        )


@router.get("/users/{azure_user_id}")
def get_azure_user(
    azure_user_id: str,
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Get a specific Azure AD user by ID (admin only)."""
    try:
        user = azure_service.get_user_by_id(azure_user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in Azure AD"
            )
        
        return {
            "azure_id": user.get("id"),
            "display_name": user.get("displayName", ""),
            "email": user.get("mail") or user.get("userPrincipalName", ""),
            "username": user.get("userPrincipalName", ""),
            "job_title": user.get("jobTitle", ""),
            "department": user.get("department", ""),
            "office_location": user.get("officeLocation", ""),
            "mobile_phone": user.get("mobilePhone", ""),
            "business_phones": user.get("businessPhones", []),
            "account_enabled": user.get("accountEnabled", False)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Azure user: {str(e)}"
        )


@router.post("/sync-user/{azure_user_id}")
def sync_azure_user_to_local(
    azure_user_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Sync a specific Azure AD user to local database (admin only)."""
    try:
        # Get user from Azure AD
        azure_user = azure_service.get_user_by_id(azure_user_id)
        if not azure_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in Azure AD"
            )
        
        email = azure_user.get("mail") or azure_user.get("userPrincipalName", "")
        username = azure_user.get("userPrincipalName", "")
        
        # Check if user already exists locally
        existing_user = (
            db.query(models.User)
            .filter(
                (models.User.email == email) | (models.User.username == username)
            )
            .first()
        )
        
        if existing_user:
            return {
                "success": True,
                "message": "User already exists locally",
                "user_id": str(existing_user.user_id),
                "action": "existing"
            }
        
        # Create new local user
        # Note: We'll generate a random password since they'll use SSO
        import secrets
        temp_password = secrets.token_urlsafe(32)
        
        from ..security import get_password_hash
        new_user = models.User(
            username=username,
            email=email,
            password_hash=get_password_hash(temp_password),
            role=models.RoleEnum.EMPLOYEE  # Default to employee role
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        return {
            "success": True,
            "message": "User synced successfully",
            "user_id": str(new_user.user_id),
            "action": "created",
            "azure_data": {
                "display_name": azure_user.get("displayName", ""),
                "job_title": azure_user.get("jobTitle", ""),
                "department": azure_user.get("department", "")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync user: {str(e)}"
        )


@router.post("/sync-all-users")
def sync_all_azure_users(
    top: int = 100,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Sync multiple Azure AD users to local database (admin only)."""
    if top > 999:
        top = 999
    
    try:
        users = azure_service.get_users(top=top)
        
        created_count = 0
        existing_count = 0
        failed_count = 0
        failed_users = []
        
        from ..security import get_password_hash
        import secrets
        
        for azure_user in users:
            try:
                email = azure_user.get("mail") or azure_user.get("userPrincipalName", "")
                username = azure_user.get("userPrincipalName", "")
                
                if not email or not username:
                    failed_count += 1
                    failed_users.append({
                        "azure_id": azure_user.get("id"),
                        "reason": "Missing email or username"
                    })
                    continue
                
                # Check if user exists
                existing_user = (
                    db.query(models.User)
                    .filter(
                        (models.User.email == email) | (models.User.username == username)
                    )
                    .first()
                )
                
                if existing_user:
                    existing_count += 1
                    continue
                
                # Create new user
                temp_password = secrets.token_urlsafe(32)
                new_user = models.User(
                    username=username,
                    email=email,
                    password_hash=get_password_hash(temp_password),
                    role=models.RoleEnum.EMPLOYEE
                )
                
                db.add(new_user)
                created_count += 1
                
            except Exception as e:
                failed_count += 1
                failed_users.append({
                    "azure_id": azure_user.get("id"),
                    "username": azure_user.get("userPrincipalName", ""),
                    "reason": str(e)
                })
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Sync completed: {created_count} created, {existing_count} existing, {failed_count} failed",
            "summary": {
                "created": created_count,
                "existing": existing_count,
                "failed": failed_count,
                "total_processed": len(users)
            },
            "failed_users": failed_users
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync users: {str(e)}"
        )