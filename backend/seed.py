"""Creates demo accounts and two prescriptions whose first doses fall in the next few minutes.
Run once:  python seed.py"""
from datetime import datetime, timedelta, date, time
from PIL import Image, ImageDraw
import os
from app.db import SessionLocal, Base, engine
from app.models import *
from app.security import hash_password
from app import services as svc

Base.metadata.create_all(engine)
db = SessionLocal()
if db.query(User).filter_by(email="patient@demo.com").first():
    print("Demo data already exists."); raise SystemExit

from app.db import DATA_DIR
up = str(DATA_DIR / "uploads"); os.makedirs(up, exist_ok=True)


def tablet(name, color, capsule=False):
    img = Image.new("RGB", (400, 400), (235, 235, 235)); d = ImageDraw.Draw(img)
    if capsule: d.rounded_rectangle((90, 150, 310, 250), 50, fill=color)
    else: d.ellipse((100, 100, 300, 300), fill=color)
    img.save(os.path.join(up, name)); return name


pw = hash_password("demo123")
pat = User(name="Ramesh Rao", email="patient@demo.com", password_hash=pw, role="patient", language="en", condition="diabetes")
cg = User(name="Anita Rao", email="caregiver@demo.com", password_hash=pw, role="caregiver")
doc = User(name="Dr. Sharma (Pharmacist)", email="clinician@demo.com", password_hash=pw, role="clinician")
db.add_all([pat, cg, doc]); db.flush()
db.add(CaregiverLink(patient_id=pat.id, caregiver_id=cg.id, consent=True))

now = datetime.now()
t1, t2 = (now + timedelta(minutes=2)).strftime("%H:%M"), (now + timedelta(minutes=6)).strftime("%H:%M")
courses = [  # medicine, dosage, times, image, days, started N days ago
    ("Metformin", "500 mg, 1 tablet", [t1, "21:00"], tablet("metformin.png", (250, 250, 250)), 14, 0),
    ("Vitamin D3", "1 capsule", [t2], tablet("vitd.png", (230, 140, 20), True), 5, 0),
    ("Amoxicillin", "500 mg, 1 capsule", ["08:00", "20:00"], tablet("amox.png", (200, 60, 60), True), 5, 2),
]
for med, dose, times, img, days, ago in courses:
    p = Prescription(patient_id=pat.id, medicine=med, dosage=dose, times=",".join(times), frequency=len(times),
                     duration_days=days, start_date=date.today() - timedelta(days=ago), image_path=img, status="active")
    db.add(p); db.flush(); svc.generate_doses(db, p)
    db.flush()  # the doses must be in the database before we can look them up to mark them
    if ago:  # give the running course some history: taken, with one missed dose
        past = db.query(DoseEvent).filter(DoseEvent.prescription_id == p.id, DoseEvent.scheduled_at < now - timedelta(minutes=5)) \
                 .order_by(DoseEvent.scheduled_at).all()
        for i, e in enumerate(past):
            e.status = "missed" if i == 2 else "taken"
            if e.status == "taken": e.taken_at, e.verified = e.scheduled_at + timedelta(minutes=4), i % 2 == 0
db.add(Gamification(patient_id=pat.id, points=85, streak=2, best_streak=2, last_streak_date=date.today() - timedelta(days=1), badges="First Dose"))
db.add(Checkup(patient_id=pat.id, title="Diabetes follow-up", doctor="Dr. Sharma",
               scheduled_at=datetime.combine(date.today() + timedelta(days=6), time(10, 30)), notes="Bring your sugar readings"))
svc.detect_conflicts(db, pat.id)
db.commit()
print("Demo users (password demo123): patient@demo.com, caregiver@demo.com, clinician@demo.com")
