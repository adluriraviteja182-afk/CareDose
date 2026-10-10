# CareDose: Medication Adherence Platform (React + FastAPI)

Reminders that show the tablet image, camera check of the tablet, guarded assistant, gamification,
caregiver alerts (with patient consent), adherence reports, conflict review queue, and local-language voice (English, Hindi, Telugu).

## Run it (about 3 minutes)

**Backend** (Python 3.10+)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # optional: add GEMINI_API_KEY
python seed.py                                          # demo users + prescriptions due in the next few minutes
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

**Frontend** (Node 18+), in a second terminal
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api to port 8000)
```
For a single-server demo run `npm run build`, then open http://localhost:8000 (FastAPI serves the built app).

**To refresh the demo data** (new courses, checkup, game progress): stop the server, delete `backend/caredose.db`, run `python seed.py` again.

**Demo logins** (password `demo123`): `patient@demo.com`, `caregiver@demo.com`, `clinician@demo.com`

> Use `localhost` or HTTPS. Browsers block the camera, microphone and notifications on plain http over a network IP.
> To demo on a phone, use an HTTPS tunnel (for example `ngrok http 8000` after `npm run build`).

## Demo script
1. Log in as the patient and click **Turn on camera & alerts** once (Chrome asks for permission). Two reminders fire within about 6 minutes. At each dose time the **camera opens by itself** next to your saved tablet photo, with a spoken prompt and a browser notification.
2. Hold the tablet in the frame and tap **Check tablet** (or tap **Take medicine** on the dashboard any time). A match marks the dose Taken; points, streak and badges update. (Seed photos are plain graphics: show the image on another screen.)
3. Medicines tab: add one with no dosage, or a time within 15 min of another. It appears in the pharmacist queue.
4. Assistant tab: "When is my next dose?" works. "Should I double my dose?" is refused.
5. Skip a dose past the 30-minute grace window. It becomes Missed and the caregiver gets an alert.
6. Log in as the caregiver: Family → View → dashboard and report. Patient can remove access any time.

## How it maps to the requirements
| Requirement | Where |
|---|---|
| Prescription management, schedule, calendar | `Prescriptions.jsx`, `services.generate_doses` |
| Image reminders + voice reminders | `ReminderOverlay`, `speechSynthesis` in `i18n.js` |
| Missed-dose tracking + caregiver alert | `services.missed_dose_job`, `notify_caregivers` |
| Camera tablet verification | `ai.verify_tablet`, `CameraCheck` |
| Conflict / incomplete detection + review | `services.detect_conflicts`, `Review.jsx` |
| Chatbot with guardrails, voice in/out | `ai.chat_reply` (`BLOCKED` regex + system prompt), `Chat.jsx` |
| Diet and water guidance | `ai.DIET`, dashboard card |
| Gamification, levels, badges, leaderboard | `services.award_taken`, `/api/leaderboard` |
| Challenges, rewards, levels, badges | `services.challenge_list`, `claim_challenge`, `Play.jsx` |
| Calendar, course days left, last-day markers | `services.calendar_month`, `courses`, `Calendar.jsx` |
| Next checkup + reminder the day before | `Checkup` model, `services.checkup_job`, Calendar and Dashboard |
| Reports (daily, weekly, monthly) | `services.adherence`, `Report.jsx` |
| Caregiver consent and privacy | `security.resolve_patient`, `/api/links` |
| Accessibility for elderly | Atkinson Hyperlegible font, 18px base, 48px+ targets, high contrast |

## Honest limitations (say these in your pitch)
- **Reminders work while the app is open** (in-app overlay, voice, browser notification). Background push when the app is closed needs Web Push (VAPID keys + service worker). That is the first production upgrade.
- **Tablet check:** with `requirements-ai.txt` installed it compares MobileNetV2 embeddings (threshold `VERIFY_THRESHOLD`, default 0.80, so tune it with your own tablets). Without it, a simple colour match is used. It confirms "looks like the saved photo", not that the tablet is safe or correct. A manual confirm is offered after 2 failed tries.
- **Chatbot safety:** a keyword filter blocks advice-seeking questions before the model sees them, and the model is told to answer only from the schedule. It is a safeguard, not a guarantee. Test it with your own tricky prompts.
- Times use the server's local clock (single time zone). SQLite is for the demo; set `DATABASE_URL` for Postgres.
- This is a prototype: not a medical device, no real patient data.

## Structure
```
backend/app/  main.py (routes) · services.py (rules) · ai.py (verify, chat, diet, STT) · models.py · security.py
backend/seed.py
frontend/src/ App.jsx · components.jsx · i18n.js · pages/*
```