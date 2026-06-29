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


@router.get("/users/mfa-status")
def get_users_mfa_status_route(
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Get MFA registration status for all Entra users (admin only).

    Calls Microsoft Graph /users/{id}/authentication/methods for each user.
    Requires UserAuthenticationMethod.Read.All application permission with admin consent.
    """
    try:
        users = azure_service.get_users(top=100)
        user_ids = [u.get("id") for u in users if u.get("id")]
        mfa_map = azure_service.get_users_mfa_status(user_ids)

        result = []
        for u in users:
            uid = u.get("id")
            mfa_info = mfa_map.get(uid, {"mfa_registered": None, "mfa_methods": []})
            result.append({
                "azure_id": uid,
                "display_name": u.get("displayName"),
                "mfa_registered": mfa_info.get("mfa_registered"),
                "mfa_methods": mfa_info.get("mfa_methods", []),
                "error": mfa_info.get("error"),
            })

        return {"total": len(result), "users": result}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch MFA status: {str(e)}"
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
        entra_id = azure_user.get("id", "")
        upn = azure_user.get("userPrincipalName", "")
        new_user = models.User(
            username=username,
            email=email,
            password_hash=get_password_hash(temp_password),
            role=models.RoleEnum.EMPLOYEE,
            auth_provider="entra",
            linked_entra_user_id=entra_id,
            linked_entra_upn=upn,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return {
            "success": True,
            "message": "User synced successfully",
            "user_id": str(new_user.user_id),
            "action": "created",
            "temp_password": temp_password,
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
                    role=models.RoleEnum.EMPLOYEE,
                    auth_provider="entra",
                    linked_entra_user_id=azure_user.get("id", ""),
                    linked_entra_upn=azure_user.get("userPrincipalName", ""),
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


@router.get("/subscribed-skus")
def get_subscribed_skus(
    current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Get subscribed SKUs (licenses) from Azure AD (admin only).
    
    Returns the list of commercial subscriptions that the organization has acquired.
    Used to determine which Microsoft 365/Azure licenses are available.
    """
    try:
        skus = azure_service.get_subscribed_skus()
        
        # Transform SKU data
        transformed_skus = []
        for sku in skus:
            transformed_sku = {
                "skuId": sku.get("skuId"),
                "skuPartNumber": sku.get("skuPartNumber"),
                "capabilityStatus": sku.get("capabilityStatus"),
                "consumedUnits": sku.get("consumedUnits", 0),
                "prepaidUnits": {
                    "enabled": sku.get("prepaidUnits", {}).get("enabled", 0),
                    "suspended": sku.get("prepaidUnits", {}).get("suspended", 0),
                    "warning": sku.get("prepaidUnits", {}).get("warning", 0),
                },
            }
            transformed_skus.append(transformed_sku)
        
        return {
            "total": len(transformed_skus),
            "skus": transformed_skus
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subscribed SKUs: {str(e)}"
        )