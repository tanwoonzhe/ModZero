"""Initialize superuser on application startup."""

import os
from sqlalchemy.orm import Session

from .models import User, RoleEnum
from .security import get_password_hash
from .db import SessionLocal


def create_initial_superuser() -> None:
    """Create initial superuser if it doesn't exist."""
    db: Session = SessionLocal()
    try:
        # Get superuser credentials from environment
        username = os.getenv("INITIAL_SUPERUSER_USERNAME", "admin")
        email = os.getenv("INITIAL_SUPERUSER_EMAIL", "admin@modzero.com")
        password = os.getenv("INITIAL_SUPERUSER_PASSWORD", "admin123")
        
        print(f"🔍 Creating superuser with username: {username}, email: {email}, password length: {len(password)}")
        
        # Ensure password is not too long for bcrypt (max 72 bytes)
        if len(password.encode('utf-8')) > 72:
            password = password[:72]
            print(f"⚠️ Password truncated to 72 bytes")
        
        # Check if superuser already exists
        existing_user = (
            db.query(User)
            .filter((User.username == username) | (User.email == email))
            .first()
        )
        
        if not existing_user:
            # Create superuser
            password_hash = get_password_hash(password)
            superuser = User(
                username=username,
                email=email,
                password_hash=password_hash,
                role=RoleEnum.ADMIN,
            )
            db.add(superuser)
            db.commit()
            print(f"✅ Initial superuser created: {username} ({email})")
        else:
            print(f"ℹ️ Superuser already exists: {existing_user.username}")
            
    except Exception as e:
        print(f"❌ Error creating superuser: {e}")
        import traceback
        print(traceback.format_exc())
        db.rollback()
    finally:
        db.close()