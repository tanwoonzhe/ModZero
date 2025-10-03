from sqlalchemy.orm import Session
from .db import Base, engine
from .models import AccessLog

def init_db():
    Base.metadata.create_all(bind=engine)
