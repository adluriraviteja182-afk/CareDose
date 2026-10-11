from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # patient | caregiver | clinician
    language = Column(String, default="en")
    condition = Column(String, default="general")
    created_at = Column(DateTime, default=datetime.now)


class CaregiverLink(Base):
    __tablename__ = "caregiver_links"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    caregiver_id = Column(Integer, ForeignKey("users.id"), index=True)
    consent = Column(Boolean, default=False)  # set only by the patient
    created_at = Column(DateTime, default=datetime.now)


class Prescription(Base):
    __tablename__ = "prescriptions"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    medicine = Column(String, default="")
    dosage = Column(String, default="")
    times = Column(String, default="")  # "08:00,20:00"
    frequency = Column(Integer, default=0)
    duration_days = Column(Integer, default=0)
    start_date = Column(Date, default=date.today)
    notes = Column(Text, default="")
    image_path = Column(String, default="")
    status = Column(String, default="active")  # active | incomplete
    created_at = Column(DateTime, default=datetime.now)


class DoseEvent(Base):
    __tablename__ = "dose_events"
    id = Column(Integer, primary_key=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    scheduled_at = Column(DateTime, index=True)
    status = Column(String, default="pending")  # pending | taken | missed
    taken_at = Column(DateTime, nullable=True)
    verified = Column(Boolean, default=False)  # True when confirmed by camera


class Conflict(Base):
    __tablename__ = "conflicts"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    kind = Column(String)  # overlap | incomplete
    detail = Column(Text)
    key = Column(String, index=True)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)


class Gamification(Base):
    __tablename__ = "gamification"
    patient_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    points = Column(Integer, default=0)
    streak = Column(Integer, default=0)
    best_streak = Column(Integer, default=0)
    last_streak_date = Column(Date, nullable=True)
    badges = Column(String, default="")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    message = Column(Text)
    created_at = Column(DateTime, default=datetime.now)
    read = Column(Boolean, default=False)


class Checkup(Base):
    __tablename__ = "checkups"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String, default="Doctor checkup")
    doctor = Column(String, default="")
    scheduled_at = Column(DateTime, index=True)
    notes = Column(Text, default="")
    done = Column(Boolean, default=False)
    reminded = Column(Boolean, default=False)


class Claim(Base):
    """A reward the patient has collected. (key, period) can only be claimed once."""
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    key = Column(String)
    period = Column(String)  # date for daily, ISO week for weekly, "once" for milestones
    points = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)


class PushSub(Base):
    """A browser/phone that agreed to receive alarms, even when CareDose is closed."""
    __tablename__ = "push_subs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    endpoint = Column(Text, unique=True)
    p256dh = Column(Text)
    auth = Column(Text)
    created_at = Column(DateTime, default=datetime.now)


class DoseNotice(Base):
    """Remembers that the alarm for a dose was already pushed, so it is sent once."""
    __tablename__ = "dose_notices"
    dose_id = Column(Integer, primary_key=True)
    sent_at = Column(DateTime, default=datetime.now)


class PrescriptionDoc(Base):
    """The doctor's prescription itself (photo or PDF). Stored privately, never served publicly."""
    __tablename__ = "prescription_docs"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True)
    filename = Column(String)
    original_name = Column(String)
    content_type = Column(String)
    uploaded_at = Column(DateTime, default=datetime.now)
    read_at = Column(DateTime, nullable=True)
