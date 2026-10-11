"""Tablet verification, guarded chatbot, diet guidance, speech-to-text."""
import os, re
from datetime import datetime, timedelta
import cv2, numpy as np, httpx
from sqlalchemy.orm import Session
from .models import Prescription, DoseEvent
from .services import parse_times

VERIFY_THRESHOLD = float(os.getenv("VERIFY_THRESHOLD", "0.80"))
HIST_THRESHOLD = float(os.getenv("HIST_THRESHOLD", "0.55"))
_model = None


# ---------- tablet verification ----------
def _decode(data: bytes):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image")
    h, w = img.shape[:2]  # centre crop: the tablet should be held in the middle
    return img[int(h * .2):int(h * .8), int(w * .2):int(w * .8)]


def _torch_embed(img):
    global _model
    import torch
    from torchvision import models, transforms
    if _model is None:
        _model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT).features.eval()
    tf = transforms.Compose([transforms.ToPILImage(), transforms.Resize((224, 224)), transforms.ToTensor(),
                             transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    with torch.no_grad():
        f = _model(tf(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).unsqueeze(0)).mean(dim=[2, 3]).squeeze(0).numpy()
    return f / (np.linalg.norm(f) + 1e-9)


def _color(img):
    """Fallback fingerprint: mean LAB colour of the central region (where the tablet is held)."""
    h, w = img.shape[:2]
    core = img[int(h * .21):int(h * .79), int(w * .21):int(w * .79)]
    return cv2.cvtColor(core, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float).mean(0)


def _color_score(a, b) -> float:
    return 1.0 - float(np.linalg.norm(a - b)) / 100.0  # 1.0 = identical colour


def verify_tablet(live: bytes, reference_paths: list[str]) -> tuple[float, bool, str]:
    """Compare a live camera frame with the reference photos saved for the prescription."""
    live_img = _decode(live)
    refs = [_decode(open(p, "rb").read()) for p in reference_paths if os.path.exists(p)]
    if not refs:
        raise FileNotFoundError("No reference photo")
    try:
        a = _torch_embed(live_img)
        score = max(float(np.dot(a, _torch_embed(r))) for r in refs)
        return score, score >= VERIFY_THRESHOLD, "mobilenet"
    except ImportError:
        a = _color(live_img)
        score = max(_color_score(a, _color(r)) for r in refs)
        return score, score >= HIST_THRESHOLD, "colour"


# ---------- chatbot ----------
BLOCKED = re.compile(
    r"\b(increase|decrease|double|halve|reduce|stop taking|stop my|skip|change (my |the )?(dose|dosage|medicine|tablet)|"
    r"instead of|alternative|replace|overdose|side effects?|diagnos\w*|which medicine should|can i take .* with|"
    r"is it safe|safe to|should i take|how much should)\b", re.I)

REFUSAL = {
    "en": "I can't give medical advice or change a prescription. Please ask your doctor or pharmacist.",
    "hi": "मैं चिकित्सा सलाह नहीं दे सकता और न ही दवा बदल सकता हूँ। कृपया अपने डॉक्टर या फार्मासिस्ट से पूछें।",
    "te": "నేను వైద్య సలహా ఇవ్వలేను, ప్రిస్క్రిప్షన్ మార్చలేను. దయచేసి మీ డాక్టర్ లేదా ఫార్మసిస్ట్‌ను అడగండి.",
}
LANG_NAME = {"en": "English", "hi": "Hindi", "te": "Telugu"}

SYSTEM = """You are CareDose Assistant, a medication reminder helper for patients and elderly users.
You MAY: explain how and when the patient takes each medicine using ONLY the schedule given below, read out the schedule,
remind about upcoming doses, and say in ONE plain sentence what a medicine is generally used for
(general information, not advice for this patient), then add that their doctor knows why it was prescribed.
Use plain text, no markdown. You MUST NOT: give medical advice, diagnose, suggest changes to doses, timing,
or medicines, suggest alternatives, or discuss side effects or interactions. For any such question reply that the patient
must ask their doctor or pharmacist. Keep replies short, calm and simple. Reply in {lang}.

Patient's schedule:
{context}"""


def schedule_context(db: Session, patient_id: int) -> str:
    now = datetime.now()
    lines = []
    for p in db.query(Prescription).filter_by(patient_id=patient_id, status="active").all():
        lines.append(f"- {p.medicine}, {p.dosage}, at {p.times}, for {p.duration_days} days from {p.start_date}. Notes: {p.notes or 'none'}")
    nxt = (db.query(DoseEvent).filter(DoseEvent.patient_id == patient_id, DoseEvent.status == "pending",
                                      DoseEvent.scheduled_at >= now).order_by(DoseEvent.scheduled_at).limit(3).all())
    for d in nxt:
        p = db.get(Prescription, d.prescription_id)
        lines.append(f"Upcoming: {p.medicine} {p.dosage} at {d.scheduled_at:%Y-%m-%d %H:%M}")
    return "\n".join(lines) or "No prescriptions yet."


# ---------- offline assistant: understands schedule, medicine list and "what is it for" ----------
# General, plain-language purposes only. Never advice. Add more medicines here as needed.
PURPOSE = [
    ("metformin", "helps control blood sugar in type 2 diabetes"),
    ("glimepiride", "lowers blood sugar in type 2 diabetes"),
    ("amlodipine", "lowers blood pressure"), ("telmisartan", "lowers blood pressure"), ("losartan", "lowers blood pressure"),
    ("atenolol", "lowers blood pressure and slows the heart rate"),
    ("atorvastatin", "lowers cholesterol"), ("rosuvastatin", "lowers cholesterol"),
    ("aspirin", "relieves pain and fever, and in low doses helps prevent blood clots"),
    ("paracetamol", "relieves pain and reduces fever"), ("ibuprofen", "relieves pain and inflammation"),
    ("pantoprazole", "reduces stomach acid"), ("omeprazole", "reduces stomach acid"),
    ("levothyroxine", "replaces thyroid hormone for an underactive thyroid"),
    ("vitamin d", "supports bone and muscle health"), ("vitamin b12", "supports nerves and healthy blood"),
    ("vitamin c", "supports the immune system"), ("calcium", "supports bone health"),
    ("iron", "helps treat low iron levels (anaemia)"), ("ferrous", "helps treat low iron levels (anaemia)"),
    ("cetirizine", "relieves allergy symptoms"), ("montelukast", "helps prevent asthma and allergy symptoms"),
    ("amoxicillin", "is an antibiotic that treats bacterial infections"), ("azithromycin", "is an antibiotic that treats bacterial infections"),
]
FOOTER = "(General information only. Your doctor knows why it was prescribed for you.)"


def purpose_of(name: str):
    n = (name or "").lower()
    return next((text for key, text in PURPOSE if key in n), None)


def _describe(p) -> str:
    out = f"{p.medicine} ({p.dosage}) is taken at {', '.join(parse_times(p.times))}."
    pur = purpose_of(p.medicine)
    out += f" It {pur}." if pur else " I don't have details about what it is for, so please ask your doctor or pharmacist."
    return out + (f" Note: {p.notes}." if p.notes else "")


def _offline_reply(db: Session, pid: int, message: str) -> str:
    m = message.lower().strip()
    w = set(re.findall(r"[a-z0-9]+", m))
    now = datetime.now()
    pres = db.query(Prescription).filter_by(patient_id=pid, status="active").all()
    named = [p for p in pres if p.medicine and p.medicine.lower() in m]
    wants_purpose = bool(re.search(r"purpose|used for|what for|for what|helps?|why (do|should) i take|what does .* do|what is", m))
    wants_next = bool(w & {"next", "upcoming"}) or "when" in w
    wants_today = bool(w & {"today", "schedule"})
    wants_list = bool(w & {"tablet", "tablets", "medicine", "medicines", "medication", "medications", "pills", "meds", "prescription", "prescriptions", "explain", "details", "detail", "info", "information", "more"})
    wants_how = bool(re.search(r"how (do|should|to) i take|before food|after food|with food|timing", m))

    menu = "You can ask me about your next dose, today's schedule, or what each of your medicines is for."
    if len(w) <= 3 and w & {"hi", "hello", "hey"}:
        return "Hello! " + menu
    if len(w) <= 3 and w & {"thanks", "thank"}:
        return "You're welcome. " + menu
    if len(w) <= 3 and w & {"ok", "okay", "fine", "good", "yes"}:
        return "Okay. " + menu

    if wants_next:
        d = (db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.status == "pending", DoseEvent.scheduled_at >= now - timedelta(minutes=30))
             .order_by(DoseEvent.scheduled_at).first())
        if not d:
            return "You have no upcoming doses."
        p = db.get(Prescription, d.prescription_id)
        out = f"Your next dose is {p.medicine}, {p.dosage}, at {d.scheduled_at:%H:%M} on {d.scheduled_at:%d %b}."
        pur = purpose_of(p.medicine)
        if wants_purpose:
            out += f"\nIt {pur}.\n{FOOTER}" if pur else "\nI don't have details about what it is for, so please ask your doctor or pharmacist."
        return out

    if named and (wants_purpose or wants_list or wants_how):
        return "\n".join(_describe(p) for p in named) + f"\n{FOOTER}"

    if wants_today:
        start = datetime.combine(now.date(), datetime.min.time())
        ds = (db.query(DoseEvent).filter(DoseEvent.patient_id == pid, DoseEvent.scheduled_at >= start,
                                         DoseEvent.scheduled_at <= start + timedelta(days=1)).order_by(DoseEvent.scheduled_at).all())
        if not ds:
            return "You have no doses scheduled today."
        return "Today:\n" + "\n".join(f"• {d.scheduled_at:%H:%M}  {db.get(Prescription, d.prescription_id).medicine}  ({d.status})" for d in ds)

    if wants_list or wants_purpose or wants_how:
        if not pres:
            return "You have no medicines added yet. Add them on the Medicines page."
        return "Your medicines:\n" + "\n".join("• " + _describe(p) for p in pres) + f"\n{FOOTER}"

    return "I can tell you your next dose, today's schedule, and what each of your medicines is for. Try: \"explain my tablets\"."


# Tried in order if the model in .env is retired (404). gemini-2.0-flash was shut down on 1 June 2026.
GEMINI_FALLBACKS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]


def gemini_text(body: dict, key: str) -> str:
    """POST a request to Gemini, trying the configured model and then newer ones if it was retired."""
    wanted = os.getenv("GEMINI_MODEL", "").strip()
    last = ""
    for model in [m for m in dict.fromkeys([wanted, *GEMINI_FALLBACKS]) if m]:
        r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                       headers={"x-goog-api-key": key}, json=body, timeout=60)
        if r.status_code == 404:
            last = f"model {model} not found"
            continue
        if r.status_code >= 400:
            try:
                detail = r.json()["error"]["message"]
            except Exception:
                detail = r.text[:150]
            raise RuntimeError(f"{r.status_code} from Gemini: {detail}")
        parts = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
        if text:
            return text
        last = f"{model} returned an empty reply"
    raise RuntimeError(last or "no Gemini model answered")


def _gemini(system: str, history: list, message: str, key: str) -> str:
    turns = [{"role": "model" if h.get("role") == "model" else "user", "parts": [{"text": str(h.get("text", ""))[:1000]}]}
             for h in (history or [])[-6:] if h.get("text")]
    while turns and turns[0]["role"] == "model":  # Gemini wants the conversation to start with the user
        turns.pop(0)
    return gemini_text({"system_instruction": {"parts": [{"text": system}]},
                        "contents": turns + [{"role": "user", "parts": [{"text": message}]}],
                        "generationConfig": {"temperature": 0.3}}, key)


# ---------- reading a prescription photo/PDF (a DRAFT the patient must check) ----------
RX_PROMPT = """You are reading a photo or PDF of a doctor's prescription for a medicine reminder app.
Extract each prescribed medicine. Return ONLY a JSON array. Each item has exactly:
{"medicine": string, "dosage": string (strength and amount, e.g. "500 mg, 1 tablet"), "times": ["HH:MM", ...], "duration_days": integer, "notes": string (e.g. "after food")}
Convert how often to clock times: once daily or morning 08:00; twice daily (BD, 1-0-1) 08:00 and 20:00; three times (TDS, 1-1-1) 08:00, 14:00 and 20:00;
four times (QID) 08:00, 12:00, 16:00 and 20:00; at night (HS) 21:00. Convert durations to days (weeks x7, months x30).
If something is unclear or unreadable use "" for text, [] for times, 0 for days. Never guess or invent a medicine.
If the image is not a prescription, return []."""


def read_prescription(data: bytes, mime: str, key: str) -> list:
    import base64, json as _json
    text = gemini_text({"contents": [{"role": "user", "parts": [{"text": RX_PROMPT}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}]}],
                        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}, key)
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    arr = _json.loads(text)
    if isinstance(arr, dict):
        arr = arr.get("medicines", [])
    out = []
    for it in arr if isinstance(arr, list) else []:
        if not isinstance(it, dict) or not str(it.get("medicine", "")).strip():
            continue
        times = [t for t in (it.get("times") or []) if isinstance(t, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t)]
        try:
            days = max(0, min(365, int(it.get("duration_days") or 0)))
        except (TypeError, ValueError):
            days = 0
        out.append({"medicine": str(it["medicine"]).strip()[:80], "dosage": str(it.get("dosage") or "")[:80], "times": times,
                    "duration_days": days, "notes": str(it.get("notes") or "")[:120]})
    return out


def chat_reply(db: Session, patient_id: int, message: str, lang: str, history: list | None = None) -> dict:
    if BLOCKED.search(message):
        return {"reply": REFUSAL.get(lang, REFUSAL["en"]), "source": "guard", "error": None}
    key = os.getenv("GEMINI_API_KEY", "").strip().strip("\"'")
    err = None
    if key:
        try:
            system = SYSTEM.format(lang=LANG_NAME.get(lang, "English"), context=schedule_context(db, patient_id))
            return {"reply": _gemini(system, history or [], message, key), "source": "gemini", "error": None}
        except Exception as e:  # fall back to offline answers, but say why
            err = str(e).replace(key, "***")[:220]
            print("[gemini error]", err)
    return {"reply": _offline_reply(db, patient_id, message), "source": "offline", "error": err}


# ---------- diet (general wellness only) ----------
DIET = {
    "general": {"eat": ["Fresh vegetables and fruit", "Whole grains", "Pulses and lentils", "Curd or buttermilk"],
                "avoid": ["Sugary drinks", "Deep-fried snacks", "Too much salt"]},
    "diabetes": {"eat": ["Leafy greens", "Millets and whole grains", "Sprouts and pulses", "Nuts in small amounts"],
                 "avoid": ["Sweets and sugary drinks", "White rice in large portions", "Fruit juices"]},
    "hypertension": {"eat": ["Bananas and leafy greens", "Oats", "Low-fat curd", "Garlic and herbs for flavour"],
                     "avoid": ["Pickles and papad", "Packaged salty snacks", "Adding extra salt at the table"]},
    "cholesterol": {"eat": ["Oats and barley", "Fruits and vegetables", "Fish or flax seeds", "Almonds and walnuts"],
                    "avoid": ["Fried food", "Ghee and butter in excess", "Bakery items"]},
    "anemia": {"eat": ["Spinach and beetroot", "Dates and jaggery", "Pomegranate", "Vitamin C fruits like amla and orange"],
               "avoid": ["Tea or coffee right after meals", "Skipping meals"]},
}
DISCLAIMER = "General wellness guidance only. It is not medical treatment. Follow your doctor's advice."


def diet_for(condition: str) -> dict:
    d = DIET.get((condition or "general").lower(), DIET["general"])
    return {"condition": condition, **d, "water_glasses_per_day": 8, "disclaimer": DISCLAIMER}


# ---------- speech to text ----------
_whisper = None


def transcribe(data: bytes, lang: str) -> str:
    global _whisper
    from faster_whisper import WhisperModel  # optional dependency
    import tempfile
    if _whisper is None:
        _whisper = WhisperModel("small", compute_type="int8")
    with tempfile.NamedTemporaryFile(suffix=".webm") as f:
        f.write(data)
        f.flush()
        segs, _ = _whisper.transcribe(f.name, language=lang)
        return " ".join(s.text for s in segs).strip()
