from pydantic import BaseModel
import os

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg2://modzero:modzero@localhost:5432/modzero")
    weight_posture: float = float(os.getenv("TRUST_WEIGHT_POSTURE", 0.7))
    weight_context: float = float(os.getenv("TRUST_WEIGHT_CONTEXT", 0.3))
    min_threshold: int = int(os.getenv("TRUST_MIN_THRESHOLD", 70))

settings = Settings()
