import os, hashlib, hmac, secrets
from datetime import datetime, timedelta
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, CaregiverLink

SECRET = os.getenv("SECRET_KEY", "dev-secret-change-me")
if os.getenv("APP_ENV") == "production" and SECRET == "dev-secret-change-me":
    raise RuntimeError("Set a strong SECRET_KEY environment variable before running in production.")
bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${h}"


def verify_password(pw: str, stored: str) -> bool:
    salt, h = stored.split("$")
    return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex(), h)


def make_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=7)}, SECRET, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not cred:
        raise HTTPException(401, "Please log in")
    try:
        uid = int(jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Session expired. Please log in again")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "Account not found")
    return user


def resolve_patient(db: Session, user: User, patient_id: int | None) -> int:
    """Patients see themselves. Caregivers see a patient only with that patient's consent."""
    if user.role == "patient":
        return user.id
    if user.role == "caregiver" and patient_id:
        link = db.query(CaregiverLink).filter_by(patient_id=patient_id, caregiver_id=user.id, consent=True).first()
        if link:
            return patient_id
    raise HTTPException(403, "The patient has not given you access")
