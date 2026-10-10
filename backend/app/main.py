import os, shutil, uuid
from datetime import datetime, date, timedelta
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler

from .db import Base, engine, get_db, SessionLocal
from .models import *
from .security import hash_password, verify_password, make_token, current_user, resolve_patient
from . import services as svc, ai, push
from fastapi.responses import FileResponse

DOC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "private_uploads")  # prescriptions: NOT publicly served
os.makedirs(DOC_DIR, exist_ok=True)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
Base.metadata.create_all(engine)

app = FastAPI(title="CareDose API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def start_scheduler():
    sch = BackgroundScheduler()
    sch.add_job(svc.missed_dose_job, "interval", minutes=1, args=[SessionLocal])
    sch.add_job(svc.checkup_job, "interval", minutes=1, args=[SessionLocal])
    sch.add_job(push.dose_push_job, "interval", seconds=15, args=[SessionLocal])
    sch.start()


# ---------- schemas ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "patient"
    language: str = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    language: str | None = None
    condition: str | None = None


class PrescriptionIn(BaseModel):
    medicine: str = ""
    dosage: str = ""
    times: list[str] = []
    duration_days: int = 0
    start_date: date | None = None
    notes: str = ""
    doc_id: int | None = None  # set when the medicine was filled in from an uploaded prescription


class LinkIn(BaseModel):
    patient_email: EmailStr


class ConsentIn(BaseModel):
    consent: bool


class PushIn(BaseModel):
    endpoint: str
    keys: dict


class CheckupIn(BaseModel):
    title: str = "Doctor checkup"
    doctor: str = ""
    scheduled_at: datetime
    notes: str = ""


class ChatIn(BaseModel):
    message: str
    language: str = "en"
    history: list[dict] = []


# ---------- helpers ----------
def user_out(u: User):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "language": u.language, "condition": u.condition}


def pres_out(p: Prescription):
    return {"id": p.id, "medicine": p.medicine, "dosage": p.dosage, "times": svc.parse_times(p.times),
            "frequency": p.frequency, "duration_days": p.duration_days, "start_date": p.start_date.isoformat(),
            "notes": p.notes, "status": p.status, "missing": svc.missing_fields(p),
            "image_url": f"/uploads/{p.image_path}" if p.image_path else None}


def dose_out(db: Session, d: DoseEvent):
    p = db.get(Prescription, d.prescription_id)
    return {"id": d.id, "scheduled_at": d.scheduled_at.isoformat(), "status": d.status, "verified": d.verified,
            "taken_at": d.taken_at.isoformat() if d.taken_at else None, "medicine": p.medicine, "dosage": p.dosage,
            "notes": p.notes, "image_url": f"/uploads/{p.image_path}" if p.image_path else None}


def own_dose(db: Session, user: User, dose_id: int) -> DoseEvent:
    d = db.get(DoseEvent, dose_id)
    if not d or d.patient_id != user.id:
        raise HTTPException(404, "Dose not found")
    return d


def apply_prescription(p: Prescription, data: PrescriptionIn):
    p.medicine, p.dosage, p.notes = data.medicine.strip(), data.dosage.strip(), data.notes
    p.times = ",".join(t.strip() for t in data.times if t.strip())
    p.frequency = len(svc.parse_times(p.times))
    p.duration_days = data.duration_days
    p.start_date = data.start_date or date.today()
    p.status = "incomplete" if svc.missing_fields(p) else "active"


# ---------- auth ----------
@app.post("/api/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if data.role not in ("patient", "caregiver", "clinician"):
        raise HTTPException(422, "Invalid role")
    if len(data.password) < 6:
        raise HTTPException(422, "Password must be at least 6 characters")
    if db.query(User).filter_by(email=data.email.lower()).first():
        raise HTTPException(409, "This email is already registered")
    u = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password),
             role=data.role, language=data.language)
    db.add(u); db.commit()
    return {"token": make_token(u.id), "user": user_out(u)}


@app.post("/api/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=data.email.lower()).first()
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    return {"token": make_token(u.id), "user": user_out(u)}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@app.put("/api/me")
def update_me(data: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if data.language: user.language = data.language
    if data.condition: user.condition = data.condition
    db.commit()
    return user_out(user)


# ---------- caregiver linking (needs patient consent) ----------
@app.post("/api/caregiver/link")
def request_link(data: LinkIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "caregiver":
        raise HTTPException(403, "Only caregivers can request a link")
    patient = db.query(User).filter_by(email=data.patient_email.lower(), role="patient").first()
    if not patient:
        raise HTTPException(404, "No patient found with that email")
    if db.query(CaregiverLink).filter_by(patient_id=patient.id, caregiver_id=user.id).first():
        raise HTTPException(409, "Request already sent")
    db.add(CaregiverLink(patient_id=patient.id, caregiver_id=user.id, consent=False))
    db.add(Notification(user_id=patient.id, message=f"{user.name} asked to follow your medicines. Approve in Family."))
    db.commit()
    return {"ok": True}


@app.get("/api/links")
def links(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "patient":
        rows = db.query(CaregiverLink).filter_by(patient_id=user.id).all()
        return [{"id": l.id, "consent": l.consent, "person": user_out(db.get(User, l.caregiver_id))} for l in rows]
    rows = db.query(CaregiverLink).filter_by(caregiver_id=user.id).all()
    return [{"id": l.id, "consent": l.consent, "person": user_out(db.get(User, l.patient_id))} for l in rows]


@app.post("/api/links/{link_id}/consent")
def set_consent(link_id: int, data: ConsentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    l = db.get(CaregiverLink, link_id)
    if not l or l.patient_id != user.id:
        raise HTTPException(404, "Request not found")
    if data.consent:
        l.consent = True
    else:
        db.delete(l)  # withdrawing consent removes access immediately
    db.commit()
    return {"ok": True}


# ---------- prescriptions ----------
@app.get("/api/prescriptions")
def list_prescriptions(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    return [pres_out(p) for p in db.query(Prescription).filter_by(patient_id=pid).order_by(Prescription.id.desc())]


@app.post("/api/prescriptions")
def add_prescription(data: PrescriptionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "Only patients can add prescriptions")
    p = Prescription(patient_id=user.id)
    apply_prescription(p, data)
    db.add(p); db.flush()
    svc.generate_doses(db, p)
    conflicts = svc.detect_conflicts(db, user.id)
    if data.doc_id and db.get(PrescriptionDoc, data.doc_id) and db.get(PrescriptionDoc, data.doc_id).patient_id == user.id:
        db.add(Conflict(patient_id=user.id, kind="ai_read", key=f"ai-{p.id}",
                        detail=f"{p.medicine}: filled in from an uploaded prescription. Please verify it against the document."))
    db.commit()
    return {**pres_out(p), "conflicts": conflicts}


@app.put("/api/prescriptions/{pid}")
def edit_prescription(pid: int, data: PrescriptionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Prescription, pid)
    if not p or p.patient_id != user.id:
        raise HTTPException(404, "Prescription not found")
    apply_prescription(p, data)
    db.flush()
    svc.rebuild_schedule(db, p)
    conflicts = svc.detect_conflicts(db, user.id)
    db.commit()
    return {**pres_out(p), "conflicts": conflicts}


@app.delete("/api/prescriptions/{pid}")
def delete_prescription(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Prescription, pid)
    if not p or p.patient_id != user.id:
        raise HTTPException(404, "Prescription not found")
    db.query(DoseEvent).filter_by(prescription_id=pid).delete()
    db.delete(p); db.flush()
    svc.detect_conflicts(db, user.id)
    db.commit()
    return {"ok": True}


@app.post("/api/prescriptions/{pid}/image")
def upload_image(pid: int, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Prescription, pid)
    if not p or p.patient_id != user.id:
        raise HTTPException(404, "Prescription not found")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(422, "Please upload an image file")
    name = f"{uuid.uuid4().hex}{os.path.splitext(file.filename or '.jpg')[1] or '.jpg'}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        shutil.copyfileobj(file.file, f)
    p.image_path = name
    db.commit()
    return pres_out(p)


# ---------- doses ----------
@app.get("/api/doses")
def doses_for_day(day: date | None = None, patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    day = day or date.today()
    rows = db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.scheduled_at >= datetime.combine(day, datetime.min.time()),
                                      DoseEvent.scheduled_at <= datetime.combine(day, datetime.max.time())).order_by(DoseEvent.scheduled_at)
    return [dose_out(db, d) for d in rows]


@app.get("/api/doses/upcoming")
def upcoming(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    rows = db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.status == "pending",
                                      DoseEvent.scheduled_at >= datetime.now()).order_by(DoseEvent.scheduled_at).limit(5)
    return [dose_out(db, d) for d in rows]


@app.get("/api/doses/due")
def due(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Pending doses whose time has arrived and are still inside the grace window."""
    now = datetime.now()
    rows = db.query(DoseEvent).filter(DoseEvent.patient_id == user.id, DoseEvent.status == "pending",
                                      DoseEvent.scheduled_at <= now,
                                      DoseEvent.scheduled_at >= now - timedelta(minutes=svc.GRACE_MIN)).order_by(DoseEvent.scheduled_at)
    return [dose_out(db, d) for d in rows]


@app.post("/api/doses/{dose_id}/taken")
def mark_taken(dose_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = own_dose(db, user, dose_id)
    if d.status == "taken":
        return dose_out(db, d)
    d.status, d.taken_at = "taken", datetime.now()
    svc.award_taken(db, d)
    db.commit()
    return dose_out(db, d)


@app.post("/api/doses/{dose_id}/missed")
def mark_missed(dose_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = own_dose(db, user, dose_id)
    if d.status == "pending":
        svc.mark_missed(db, d)
        db.commit()
    return dose_out(db, d)


@app.post("/api/doses/{dose_id}/verify")
def verify_dose(dose_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = own_dose(db, user, dose_id)
    p = db.get(Prescription, d.prescription_id)
    if not p.image_path:
        raise HTTPException(409, "This medicine has no reference photo. Add one, or confirm manually.")
    try:
        score, ok, method = ai.verify_tablet(file.file.read(), [os.path.join(UPLOAD_DIR, p.image_path)])
    except ValueError as e:
        raise HTTPException(422, str(e))
    result = {"matched": ok, "score": round(score, 3), "method": method}
    if ok and d.status != "taken":
        d.status, d.taken_at, d.verified = "taken", datetime.now(), True
        svc.award_taken(db, d)
        db.commit()
    return {**result, "dose": dose_out(db, d)}


# ---------- dashboard, report, gamification ----------
@app.get("/api/report")
def report(period: str = "weekly", patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return svc.adherence(db, resolve_patient(db, user, patient_id), period)


@app.get("/api/dashboard")
def dashboard(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    patient = db.get(User, pid)
    g = svc.get_g(db, pid)
    db.commit()
    week = svc.adherence(db, pid, "weekly")
    return {"patient": user_out(patient), "today": doses_for_day(None, pid if user.role != "patient" else None, user, db),
            "upcoming": upcoming(pid if user.role != "patient" else None, user, db),
            "adherence": week["percentage"], "missed": week["missed"], "taken": week["taken"],
            "points": g.points, "streak": g.streak, "best_streak": g.best_streak, "level": svc.level_for(g.points),
            "badges": [b for b in (g.badges or "").split(",") if b], "diet": ai.diet_for(patient.condition),
            "level_progress": svc.level_progress(g.points), "checkup": next_checkup(db, pid),
            "courses": [c for c in svc.courses(db, pid) if c["state"] != "finished"]}


@app.get("/api/leaderboard")
def leaderboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Family leaderboard: the patient plus other patients who share a consented caregiver."""
    ids = {user.id} if user.role == "patient" else set()
    cg_ids = [l.caregiver_id for l in db.query(CaregiverLink).filter_by(patient_id=user.id, consent=True)] if user.role == "patient" else [user.id]
    for cid in cg_ids:
        ids |= {l.patient_id for l in db.query(CaregiverLink).filter_by(caregiver_id=cid, consent=True)}
    rows = [{"name": db.get(User, i).name, "points": svc.get_g(db, i).points, "streak": svc.get_g(db, i).streak} for i in ids]
    db.commit()
    return sorted(rows, key=lambda r: -r["points"])


@app.get("/api/diet")
def diet(user: User = Depends(current_user)):
    return ai.diet_for(user.condition)


# ---------- chatbot, speech ----------
@app.post("/api/chat")
def chat(data: ChatIn, patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    return ai.chat_reply(db, pid, data.message, data.language, data.history)


@app.post("/api/stt")
def stt(language: str = Form("en"), file: UploadFile = File(...), user: User = Depends(current_user)):
    try:
        return {"text": ai.transcribe(file.file.read(), language)}
    except ImportError:
        raise HTTPException(501, "Whisper is not installed. Run: pip install -r requirements-ai.txt")


# ---------- conflicts and notifications ----------
@app.get("/api/conflicts")
def conflicts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Conflict).filter_by(resolved=False)
    if user.role == "patient":
        q = q.filter_by(patient_id=user.id)
    elif user.role != "clinician":
        raise HTTPException(403, "Not allowed")
    return [{"id": c.id, "kind": c.kind, "detail": c.detail, "patient": db.get(User, c.patient_id).name, "patient_id": c.patient_id,
             "created_at": c.created_at.isoformat()} for c in q.order_by(Conflict.id.desc())]


@app.post("/api/conflicts/{cid}/resolve")
def resolve_conflict(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "clinician":
        raise HTTPException(403, "Only a pharmacist or clinician can mark this reviewed")
    c = db.get(Conflict, cid)
    if not c:
        raise HTTPException(404, "Not found")
    c.resolved = True
    db.commit()
    return {"ok": True}


@app.get("/api/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Notification).filter_by(user_id=user.id).order_by(Notification.id.desc()).limit(30).all()
    return [{"id": n.id, "message": n.message, "created_at": n.created_at.isoformat()} for n in rows]


# ---------- calendar, checkups, challenges ----------
def checkup_out(c: Checkup):
    return {"id": c.id, "title": c.title, "doctor": c.doctor, "scheduled_at": c.scheduled_at.isoformat(), "notes": c.notes,
            "done": c.done, "days_left": (c.scheduled_at.date() - date.today()).days}


def next_checkup(db: Session, pid: int):
    c = (db.query(Checkup).filter(Checkup.patient_id == pid, Checkup.done == False,  # noqa: E712
                                  Checkup.scheduled_at >= datetime.combine(date.today(), datetime.min.time()))
         .order_by(Checkup.scheduled_at).first())
    return checkup_out(c) if c else None


@app.get("/api/calendar")
def calendar(month: str | None = None, patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    month = month or date.today().strftime("%Y-%m")
    try:
        return svc.calendar_month(db, pid, month)
    except ValueError:
        raise HTTPException(422, "Month must look like 2026-10")


@app.get("/api/checkups")
def list_checkups(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = resolve_patient(db, user, patient_id)
    return [checkup_out(c) for c in db.query(Checkup).filter_by(patient_id=pid).order_by(Checkup.scheduled_at.desc()).limit(50)]


@app.post("/api/checkups")
def add_checkup(data: CheckupIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "Only the patient can add a checkup")
    c = Checkup(patient_id=user.id, title=data.title.strip() or "Doctor checkup", doctor=data.doctor.strip(), scheduled_at=data.scheduled_at, notes=data.notes)
    db.add(c); db.commit()
    return checkup_out(c)


@app.post("/api/checkups/{cid}/done")
def checkup_done(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Checkup, cid)
    if not c or c.patient_id != user.id:
        raise HTTPException(404, "Checkup not found")
    bonus = 0
    if not c.done:  # attending a checkup earns a one-time reward
        c.done, bonus = True, 25
        g = svc.get_g(db, user.id); g.points += bonus; svc.add_badge(g, "Checkup Done")
    db.commit()
    return {**checkup_out(c), "points_awarded": bonus}


@app.delete("/api/checkups/{cid}")
def delete_checkup(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Checkup, cid)
    if not c or c.patient_id != user.id:
        raise HTTPException(404, "Checkup not found")
    db.delete(c); db.commit()
    return {"ok": True}


@app.get("/api/challenges")
def challenges(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = svc.challenge_list(db, resolve_patient(db, user, patient_id))
    db.commit()
    return out


@app.post("/api/challenges/{key}/claim")
def claim(key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "Only the patient can collect rewards")
    try:
        res = svc.claim_challenge(db, user.id, key)
    except ValueError as e:
        raise HTTPException(409, str(e))
    db.commit()
    return res


# ---------- push alarms ----------
@app.get("/api/push/key")
def push_key(user: User = Depends(current_user)):
    return {"key": push.public_key()}


@app.post("/api/push/subscribe")
def push_subscribe(data: PushIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not data.keys.get("p256dh") or not data.keys.get("auth"):
        raise HTTPException(422, "Incomplete subscription")
    sub = db.query(PushSub).filter_by(endpoint=data.endpoint).first() or PushSub(endpoint=data.endpoint)
    sub.user_id, sub.p256dh, sub.auth = user.id, data.keys["p256dh"], data.keys["auth"]
    db.add(sub); db.commit()
    return {"ok": True}


@app.post("/api/push/test")
def push_test(user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = push.send(db, user.id, {"title": "CareDose test alert", "body": "If you can see this, alerts work, even when CareDose is closed.", "tag": "test", "url": "/"})
    db.commit()
    return {"sent": n}


# ---------- prescription documents (private) ----------
DOC_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}


def doc_out(d: PrescriptionDoc):
    return {"id": d.id, "name": d.original_name, "type": d.content_type, "uploaded_at": d.uploaded_at.isoformat(), "read": d.read_at is not None}


def doc_for(db: Session, user: User, doc_id: int, owner_only: bool = False) -> PrescriptionDoc:
    d = db.get(PrescriptionDoc, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    if d.patient_id == user.id:
        return d
    if not owner_only and user.role == "clinician":
        return d
    if not owner_only and user.role == "caregiver" and db.query(CaregiverLink).filter_by(patient_id=d.patient_id, caregiver_id=user.id, consent=True).first():
        return d
    raise HTTPException(404, "Document not found")


@app.post("/api/prescription-docs")
def upload_doc(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "Only patients can upload a prescription")
    ct = (file.content_type or "").lower()
    if ct not in DOC_TYPES:
        raise HTTPException(422, "Please upload a photo (JPG, PNG, WEBP) or a PDF")
    data = file.file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "File is too large. The limit is 8 MB")
    name = uuid.uuid4().hex + DOC_TYPES[ct]
    with open(os.path.join(DOC_DIR, name), "wb") as f:
        f.write(data)
    d = PrescriptionDoc(patient_id=user.id, filename=name, original_name=(file.filename or "prescription")[:120], content_type=ct)
    db.add(d); db.commit()
    return doc_out(d)


@app.get("/api/prescription-docs")
def list_docs(patient_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = patient_id if (user.role == "clinician" and patient_id) else resolve_patient(db, user, patient_id)
    return [doc_out(d) for d in db.query(PrescriptionDoc).filter_by(patient_id=pid).order_by(PrescriptionDoc.id.desc())]


@app.get("/api/prescription-docs/{doc_id}/file")
def doc_file(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = doc_for(db, user, doc_id)
    return FileResponse(os.path.join(DOC_DIR, d.filename), media_type=d.content_type)


@app.post("/api/prescription-docs/{doc_id}/read")
def read_doc(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = doc_for(db, user, doc_id, owner_only=True)
    key = os.getenv("GEMINI_API_KEY", "").strip().strip("\"'")
    if not key:
        raise HTTPException(503, "Reading prescriptions needs a Gemini key. Add GEMINI_API_KEY to backend/.env and restart.")
    try:
        meds = ai.read_prescription(open(os.path.join(DOC_DIR, d.filename), "rb").read(), d.content_type, key)
    except Exception as e:
        print("[prescription read error]", str(e).replace(key, "***")[:200])
        raise HTTPException(502, "Could not read this prescription. Try a clearer, well-lit photo, or type the medicines yourself.")
    d.read_at = datetime.now(); db.commit()
    return {"medicines": meds}


@app.delete("/api/prescription-docs/{doc_id}")
def delete_doc(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = doc_for(db, user, doc_id, owner_only=True)
    try:
        os.remove(os.path.join(DOC_DIR, d.filename))
    except OSError:
        pass
    db.delete(d); db.commit()
    return {"ok": True}


# ---------- serve the built React app (optional: run `npm run build` in /frontend) ----------
from fastapi.responses import FileResponse
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "uploads/")):
            raise HTTPException(404, "Not found")
        f = os.path.join(DIST, path)
        return FileResponse(f if path and os.path.isfile(f) else os.path.join(DIST, "index.html"))