"""Script to create a test user (employee) for testing purposes."""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session
from app.db import SessionLocal, engine
from app.models import User, RoleEnum
from app.security import get_password_hash


def create_test_user():
    """Create a test user with employee role."""
    db: Session = SessionLocal()
    
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.username == "user").first()
        if existing_user:
            print("Test user 'user' already exists!")
            print(f"  - User ID: {existing_user.user_id}")
            print(f"  - Email: {existing_user.email}")
            print(f"  - Role: {existing_user.role.value}")
            return existing_user
        
        # Create new test user
        test_user = User(
            username="user",
            email="user@modzero.com",
            password_hash=get_password_hash("user123"),
            role=RoleEnum.EMPLOYEE,
        )
        
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        
        print("✅ Test user created successfully!")
        print(f"  - Username: user")
        print(f"  - Password: user123")
        print(f"  - Email: user@modzero.com")
        print(f"  - Role: employee")
        print(f"  - User ID: {test_user.user_id}")
        
        return test_user
        
    except Exception as e:
        print(f"❌ Error creating test user: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_test_user()
