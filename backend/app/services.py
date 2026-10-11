"""Schedule generation, conflict detection, gamification, adherence, caregiver alerts."""
import os, smtplib
from datetime import datetime, date, time, timedelta
from email.message import EmailMessage
from sqlalchemy.orm import Session
from .models import (Prescription, DoseEvent, Conflict, Gamification, Notification,
                     CaregiverLink, User, Checkup, Claim)

GRACE_MIN = int(os.getenv("GRACE_MINUTES", "30"))
ON_TIME_MIN = 30
STALE_ALERT = timedelta(hours=3)  # missed doses older than this are not announced to caregivers
LEVELS = [(0, "Beginner"), (100, "Healthy Hero"), (500, "Medication Master"), (1000, "Health Champion")]


# ---------- schedule ----------
def parse_times(s: str) -> list[str]:
    return [t.strip() for t in (s or "").split(",") if t.strip()]


def valid_time(t: str) -> bool:
    try:
        datetime.strptime(t, "%H:%M")
        return True
    except ValueError:
        return False


def missing_fields(p: Prescription) -> list[str]:
    out = []
    if not (p.medicine or "").strip(): out.append("medicine name")
    if not (p.dosage or "").strip(): out.append("dosage")
    times = parse_times(p.times)
    if not times: out.append("timing")
    elif not all(valid_time(t) for t in times): out.append("valid timing (HH:MM)")
    if not p.duration_days or p.duration_days < 1: out.append("duration")
    if times and p.frequency != len(times): out.append("frequency (does not match number of times)")
    return out


def generate_doses(db: Session, p: Prescription, from_dt: datetime | None = None):
    if p.status != "active":
        return
    for d in range(p.duration_days):
        day = p.start_date + timedelta(days=d)
        for t in parse_times(p.times):
            h, m = map(int, t.split(":"))
            at = datetime.combine(day, time(h, m))
            if from_dt is None or at >= from_dt:
                db.add(DoseEvent(prescription_id=p.id, patient_id=p.patient_id, scheduled_at=at))


def rebuild_schedule(db: Session, p: Prescription):
    """Drop future pending doses and regenerate them. Taken/missed history stays."""
    now = datetime.now()
    db.query(DoseEvent).filter(DoseEvent.prescription_id == p.id, DoseEvent.status == "pending",
                               DoseEvent.scheduled_at >= now).delete()
    generate_doses(db, p, from_dt=now)


def minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def detect_conflicts(db: Session, patient_id: int):
    """Flag incomplete entries and overlapping timings for pharmacist/clinician review."""
    # only recompute the automatic checks. "ai_read" flags stay until a pharmacist reviews them.
    db.query(Conflict).filter(Conflict.patient_id == patient_id, Conflict.resolved == False,  # noqa: E712
                              Conflict.kind.in_(["overlap", "incomplete"])).delete(synchronize_session=False)
    pres = db.query(Prescription).filter_by(patient_id=patient_id).all()
    found = []
    for p in pres:
        miss = missing_fields(p)
        if miss:
            found.append(("incomplete", f"{p.medicine or 'Unnamed medicine'}: missing {', '.join(miss)}", f"inc-{p.id}-{','.join(miss)}"))
    active = [p for p in pres if p.status == "active"]
    for i, a in enumerate(active):
        for b in active[i + 1:]:
            a_end = a.start_date + timedelta(days=a.duration_days - 1)
            b_end = b.start_date + timedelta(days=b.duration_days - 1)
            if a.start_date > b_end or b.start_date > a_end:
                continue
            for ta in parse_times(a.times):
                for tb in parse_times(b.times):
                    if abs(minutes(ta) - minutes(tb)) <= 15:
                        found.append(("overlap", f"{a.medicine} ({ta}) overlaps with {b.medicine} ({tb})",
                                      f"ovl-{min(a.id,b.id)}-{max(a.id,b.id)}-{ta}-{tb}"))
    resolved_keys = {c.key for c in db.query(Conflict).filter_by(patient_id=patient_id, resolved=True)}
    for kind, detail, key in found:
        if key not in resolved_keys:
            db.add(Conflict(patient_id=patient_id, kind=kind, detail=detail, key=key))
    return [f[1] for f in found]


# ---------- gamification ----------
def get_g(db: Session, patient_id: int) -> Gamification:
    g = db.get(Gamification, patient_id)
    if not g:
        g = Gamification(patient_id=patient_id, points=0, streak=0, best_streak=0, badges="")
        db.add(g)
        db.flush()
    return g


def level_for(points: int) -> str:
    name = LEVELS[0][1]
    for need, label in LEVELS:
        if points >= need:
            name = label
    return name


def add_badge(g: Gamification, badge: str):
    have = [b for b in (g.badges or "").split(",") if b]
    if badge not in have:
        have.append(badge)
        g.badges = ",".join(have)


def award_taken(db: Session, dose: DoseEvent):
    g = get_g(db, dose.patient_id)
    delta = abs((dose.taken_at - dose.scheduled_at).total_seconds()) / 60
    g.points += 10 if delta <= ON_TIME_MIN else 5
    today = date.today()
    if g.last_streak_date != today:
        g.streak = g.streak + 1 if g.last_streak_date == today - timedelta(days=1) else 1
        g.last_streak_date = today
    g.best_streak = max(g.best_streak, g.streak)
    add_badge(g, "First Dose")
    if g.streak >= 3: add_badge(g, "3-Day Streak")
    if g.streak >= 7: add_badge(g, "7-Day Streak")
    if g.points >= 100: add_badge(g, "100 Points")
    if dose.verified: add_badge(g, "Camera Verified")


# ---------- adherence ----------
def adherence(db: Session, patient_id: int, period: str = "weekly") -> dict:
    days = {"daily": 1, "weekly": 7, "monthly": 30}.get(period, 7)
    start = datetime.combine(date.today() - timedelta(days=days - 1), time.min)
    now = datetime.now()
    events = db.query(DoseEvent).filter(DoseEvent.patient_id == patient_id, DoseEvent.scheduled_at >= start,
                                        DoseEvent.scheduled_at <= now).all()
    taken = sum(e.status == "taken" for e in events)
    missed = sum(e.status == "missed" for e in events)
    pending = sum(e.status == "pending" for e in events)
    done = taken + missed
    by_day = {}
    for e in events:
        d = by_day.setdefault(e.scheduled_at.date().isoformat(), {"taken": 0, "missed": 0})
        if e.status in ("taken", "missed"):
            d[e.status] += 1
    return {"period": period, "taken": taken, "missed": missed, "pending": pending,
            "percentage": round(100 * taken / done) if done else 100,
            "days": [{"date": k, **v} for k, v in sorted(by_day.items())]}


# ---------- caregiver alerts ----------
def notify_caregivers(db: Session, patient_id: int, message: str):
    patient = db.get(User, patient_id)
    links = db.query(CaregiverLink).filter_by(patient_id=patient_id, consent=True).all()
    for link in links:
        db.add(Notification(user_id=link.caregiver_id, message=message))
        from . import push
        push.send(db, link.caregiver_id, {"title": "CareDose alert", "body": message, "tag": f"alert-{link.id}-{datetime.now():%H%M}", "url": "/family"})
        cg = db.get(User, link.caregiver_id)
        send_email(cg.email, f"CareDose alert for {patient.name}", message)


def send_email(to: str, subject: str, body: str):
    host = os.getenv("SMTP_HOST")
    if not host:
        print(f"[email skipped - SMTP not set] to={to} subject={subject}")
        return
    try:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = os.getenv("SMTP_FROM", "caredose@example.com"), to, subject
        msg.set_content(body)
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587"))) as s:
            s.starttls()
            if os.getenv("SMTP_USER"):
                s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS", ""))
            s.send_message(msg)
    except Exception as e:  # never let email failure break the app
        print("[email error]", e)


def mark_missed(db: Session, dose: DoseEvent, notify: bool = True):
    dose.status = "missed"
    g = get_g(db, dose.patient_id)
    g.streak = 0
    if not notify:
        return
    p = db.get(Prescription, dose.prescription_id)
    patient = db.get(User, dose.patient_id)
    notify_caregivers(db, dose.patient_id,
                      f"{patient.name} missed {p.medicine} ({p.dosage}) scheduled at {dose.scheduled_at:%H:%M}.")


def missed_dose_job(SessionLocal):
    """Runs every minute: pending doses past the grace window become missed."""
    db = SessionLocal()
    try:
        now = datetime.now()
        cutoff = now - timedelta(minutes=GRACE_MIN)
        for d in db.query(DoseEvent).filter(DoseEvent.status == "pending", DoseEvent.scheduled_at < cutoff).all():
            # After downtime, doses from hours ago are recorded as missed but do not alert the family about old news.
            mark_missed(db, d, notify=d.scheduled_at >= now - STALE_ALERT)
        db.commit()
    finally:
        db.close()


# ---------- levels ----------
def level_progress(points: int) -> dict:
    cur, nxt = LEVELS[0], None
    for i, (need, label) in enumerate(LEVELS):
        if points >= need:
            cur, nxt = (need, label), (LEVELS[i + 1] if i + 1 < len(LEVELS) else None)
    if not nxt:
        return {"level": cur[1], "next_level": None, "next_at": None, "pct": 100, "to_go": 0}
    return {"level": cur[1], "next_level": nxt[1], "next_at": nxt[0],
            "pct": round(100 * (points - cur[0]) / (nxt[0] - cur[0])), "to_go": nxt[0] - points}


# ---------- courses (how many days of each tablet are left) ----------
def courses(db: Session, pid: int) -> list[dict]:
    today, out = date.today(), []
    for p in db.query(Prescription).filter_by(patient_id=pid, status="active").order_by(Prescription.start_date):
        end = p.start_date + timedelta(days=p.duration_days - 1)
        evs = db.query(DoseEvent).filter_by(prescription_id=p.id).all()
        state = "upcoming" if today < p.start_date else "finished" if today > end else "running"
        out.append({"id": p.id, "medicine": p.medicine, "dosage": p.dosage, "start": p.start_date.isoformat(), "end": end.isoformat(),
                    "total_days": p.duration_days, "state": state,
                    "day_no": 0 if state == "upcoming" else min((today - p.start_date).days + 1, p.duration_days),
                    "days_left": 0 if state == "finished" else max(0, (end - today).days),
                    "taken": sum(e.status == "taken" for e in evs), "missed": sum(e.status == "missed" for e in evs), "total": len(evs)})
    return out


def finished_courses(db: Session, pid: int) -> int:
    n = 0
    for p in db.query(Prescription).filter_by(patient_id=pid, status="active"):
        evs = db.query(DoseEvent).filter_by(prescription_id=p.id).all()
        if evs and not any(e.status == "pending" for e in evs) and sum(e.status == "taken" for e in evs) / len(evs) >= 0.8:
            n += 1
    return n


def calendar_month(db: Session, pid: int, month: str) -> dict:
    y, m = map(int, month.split("-"))
    first, nxt = date(y, m, 1), date(y + (m == 12), m % 12 + 1, 1)
    days: dict = {}
    slot = lambda iso: days.setdefault(iso, {"doses": [], "starts": [], "ends": [], "checkups": []})
    for e in (db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.scheduled_at >= datetime.combine(first, time.min),
                                         DoseEvent.scheduled_at < datetime.combine(nxt, time.min)).order_by(DoseEvent.scheduled_at)):
        p = db.get(Prescription, e.prescription_id)
        slot(e.scheduled_at.date().isoformat())["doses"].append({"id": e.id, "time": e.scheduled_at.strftime("%H:%M"), "medicine": p.medicine,
                                                                 "dosage": p.dosage, "status": e.status})
    for p in db.query(Prescription).filter_by(patient_id=pid, status="active"):
        end = p.start_date + timedelta(days=p.duration_days - 1)
        if first <= p.start_date < nxt: slot(p.start_date.isoformat())["starts"].append(p.medicine)
        if first <= end < nxt: slot(end.isoformat())["ends"].append(p.medicine)
    for c in (db.query(Checkup).filter(Checkup.patient_id == pid, Checkup.scheduled_at >= datetime.combine(first, time.min),
                                       Checkup.scheduled_at < datetime.combine(nxt, time.min))):
        slot(c.scheduled_at.date().isoformat())["checkups"].append({"id": c.id, "title": c.title, "doctor": c.doctor,
                                                                    "time": c.scheduled_at.strftime("%H:%M"), "done": c.done})
    return {"month": month, "days": days, "courses": courses(db, pid)}


# ---------- challenges ----------
def week_key(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def challenge_list(db: Session, pid: int) -> list[dict]:
    today = date.today()
    d0 = datetime.combine(today, time.min)
    w0 = datetime.combine(today - timedelta(days=today.weekday()), time.min)
    g = get_g(db, pid)
    q = lambda a, b: db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.scheduled_at >= a, DoseEvent.scheduled_at < b).all()
    td, wk = q(d0, d0 + timedelta(days=1)), q(w0, w0 + timedelta(days=7))
    on_time = any(e.status == "taken" and e.taken_at and abs((e.taken_at - e.scheduled_at).total_seconds()) / 60 <= ON_TIME_MIN for e in td)
    dk, wkk = today.isoformat(), week_key(today)
    # (key, title, description, kind, period, progress, target, points, icon)
    defs = []
    if td:
        defs.append(("daily_all", "Full house", "Take every dose scheduled today", "daily", dk, sum(e.status == "taken" for e in td), len(td), 20, "check"))
    defs += [
        ("daily_ontime", "Right on time", "Take a dose within 30 minutes of its time", "daily", dk, int(on_time), 1, 10, "bell"),
        ("weekly_10", "Steady week", "Take 10 doses this week", "weekly", wkk, sum(e.status == "taken" for e in wk), 10, 50, "calendar"),
        ("weekly_cam", "Camera champion", "Verify 3 tablets with the camera this week", "weekly", wkk, sum(e.status == "taken" and e.verified for e in wk), 3, 40, "camera"),
        ("streak_3", "3-day streak", "Take your medicine 3 days in a row", "milestone", "once", g.best_streak, 3, 30, "star"),
        ("streak_7", "7-day streak", "Take your medicine 7 days in a row", "milestone", "once", g.best_streak, 7, 100, "star"),
        ("streak_14", "Two-week hero", "Take your medicine 14 days in a row", "milestone", "once", g.best_streak, 14, 250, "trophy"),
        ("course_done", "Course complete", "Finish a full medicine course", "milestone", "once", finished_courses(db, pid), 1, 60, "trophy"),
    ]
    claimed = {(c.key, c.period) for c in db.query(Claim).filter_by(patient_id=pid)}
    out = []
    for key, title, desc, kind, period, prog, target, pts, icon in defs:
        status = "claimed" if (key, period) in claimed else "claimable" if prog >= target else "active"
        out.append({"key": key, "title": title, "description": desc, "kind": kind, "progress": min(prog, target), "target": target,
                    "points": pts, "icon": icon, "status": status, "period": period})
    return out


MILESTONE_BADGE = {"streak_3": "3-Day Streak", "streak_7": "7-Day Streak", "streak_14": "Two-Week Hero", "course_done": "Course Complete"}


def claim_challenge(db: Session, pid: int, key: str) -> dict:
    ch = next((c for c in challenge_list(db, pid) if c["key"] == key), None)
    if not ch:
        raise ValueError("That challenge does not exist")
    if ch["status"] == "claimed":
        raise ValueError("You already collected this reward")
    if ch["status"] != "claimable":
        raise ValueError("Keep going. This challenge is not finished yet")
    g = get_g(db, pid)
    db.add(Claim(patient_id=pid, key=key, period=ch["period"], points=ch["points"]))
    g.points += ch["points"]
    if key in MILESTONE_BADGE: add_badge(g, MILESTONE_BADGE[key])
    if g.points >= 100: add_badge(g, "100 Points")
    return {"points_awarded": ch["points"], "points": g.points, **level_progress(g.points), "title": ch["title"]}


# ---------- checkup reminder ----------
def checkup_job(SessionLocal):
    """Runs every minute: tells the patient (and consented caregivers) the day before a checkup."""
    db = SessionLocal()
    try:
        now = datetime.now()
        for c in db.query(Checkup).filter(Checkup.done == False, Checkup.reminded == False,  # noqa: E712
                                          Checkup.scheduled_at >= now, Checkup.scheduled_at <= now + timedelta(hours=24)):
            msg = f"Checkup reminder: {c.title}{' with ' + c.doctor if c.doctor else ''} on {c.scheduled_at:%d %b at %H:%M}."
            db.add(Notification(user_id=c.patient_id, message=msg))
            from . import push
            push.send(db, c.patient_id, {"title": "Checkup tomorrow", "body": msg, "tag": f"checkup-{c.id}", "url": "/calendar"})
            notify_caregivers(db, c.patient_id, msg)
            c.reminded = True
        db.commit()
    finally:
        db.close()