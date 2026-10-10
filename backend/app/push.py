"""Web Push: lets the alarm reach the patient's phone or browser even when CareDose is closed."""
import os, json, base64
from pathlib import Path
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import PushSub, DoseNotice, DoseEvent, Prescription

KEY_FILE = Path(__file__).resolve().parent.parent / "vapid_private.pem"  # created on first run, keep it private
SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:caredose@example.com")
GRACE = int(os.getenv("GRACE_MINUTES", "30"))


def _vapid():
    from py_vapid import Vapid
    if KEY_FILE.exists():
        return Vapid.from_file(str(KEY_FILE))
    v = Vapid(); v.generate_keys(); v.save_key(str(KEY_FILE))
    return v


def public_key():
    """The key the browser needs to subscribe. None if pywebpush is not installed."""
    try:
        from cryptography.hazmat.primitives import serialization
        raw = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    except ImportError:
        return None


def send(db: Session, user_id: int, payload: dict) -> int:
    """Push a notification to every device this user enabled. Returns how many were accepted."""
    try:
        from pywebpush import webpush, WebPushException
        _vapid()
    except ImportError:
        return 0
    sent = 0
    for sub in db.query(PushSub).filter_by(user_id=user_id).all():
        try:
            webpush(subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=json.dumps(payload), vapid_private_key=str(KEY_FILE), vapid_claims={"sub": SUBJECT},
                    ttl=GRACE * 60, headers={"Urgency": "high"})
            sent += 1
        except WebPushException as e:
            if getattr(e.response, "status_code", None) in (404, 410):  # device unsubscribed: forget it
                db.delete(sub)
            else:
                print("[push error]", str(e)[:160])
        except Exception as e:
            print("[push error]", str(e)[:160])
    return sent


def dose_push_job(SessionLocal):
    """Runs every 15 seconds: when a dose is due, ring the patient's devices (once per dose)."""
    db = SessionLocal()
    try:
        now = datetime.now()
        due = db.query(DoseEvent).filter(DoseEvent.status == "pending", DoseEvent.scheduled_at <= now,
                                         DoseEvent.scheduled_at >= now - timedelta(minutes=GRACE)).all()
        for d in due:
            if db.get(DoseNotice, d.id):
                continue
            db.add(DoseNotice(dose_id=d.id))
            p = db.get(Prescription, d.prescription_id)
            send(db, d.patient_id, {"title": "Time for your medicine", "body": f"{p.medicine} · {p.dosage}",
                                    "icon": f"/uploads/{p.image_path}" if p.image_path else None, "tag": f"dose-{d.id}", "url": "/"})
        db.commit()
    finally:
        db.close()