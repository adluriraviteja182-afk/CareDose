# Deploying CareDose: Vercel (website) + Render (backend)

Why two hosts: Vercel is made for websites. CareDose's backend also runs timers every few seconds (missed doses, alarms),
keeps a database, and stores uploaded photos, so it needs a host that stays running.

```
Phone / laptop  ->  Vercel (React website, HTTPS)  ->  Render (FastAPI + Postgres)  ->  Gemini
```

## 0. Before you start
1. **Check your GitHub repo has no secrets.** Open the repo on GitHub and make sure there is no `.env` file, no `*.pem`, and no `caredose.db`.
   If your Gemini key was ever pushed, delete that key in Google AI Studio and create a new one.
2. Your repo root should contain the `backend` and `frontend` folders. (If everything is inside one extra folder, use that folder's name wherever this guide says `backend` or `frontend`.)
3. Add the new files from this update, then:
```
git add .
git commit -m "Deployment setup"
git push
```

## 1. Backend on Render
1. **New → PostgreSQL.** Create it, then copy its **Internal Database URL**.
   - Free databases expire about 30 days after creation. For anything you want to keep, use a paid database or another Postgres provider; any works through `DATABASE_URL`.
2. **New → Web Service** → connect your GitHub repo and set:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |
| Instance type | **Starter (paid) recommended.** See "Free tier" below. |

3. **Environment variables:**

| Name | Value |
|---|---|
| `PYTHON_VERSION` | `3.11.9` (a `.python-version` file does the same) |
| `APP_ENV` | `production` |
| `SECRET_KEY` | a long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | the Internal Database URL from step 1 |
| `GEMINI_API_KEY` | your **new** Gemini key |
| `GEMINI_MODEL` | `gemini-3.5-flash` |
| `VAPID_PRIVATE_KEY` | run `python make_vapid.py` in the backend folder and paste the whole `VAPID_PRIVATE_KEY=...` value (without the name) |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `PUBLIC_URL` | your Render address, e.g. `https://caredose-api.onrender.com` (add after the first deploy) |
| `CORS_ORIGINS` | your Vercel address, e.g. `https://caredose.vercel.app` (add after step 2) |

4. **Keep uploads (paid instances):** add a **Disk** mounted at `/data`, and set `DATA_DIR=/data`.
   Without a disk, tablet photos and prescriptions are deleted every time the service redeploys or restarts. The database is safe either way because it is separate.
5. After it deploys, open `https://YOUR-BACKEND.onrender.com/api/health`. You should see `{"ok":true}`. `/docs` lists every route.

## 2. Website on Vercel
1. **Add New → Project** → import the same GitHub repo.
2. **Root Directory: `frontend`**. Framework should show **Vite**.
3. **Environment Variables:** `VITE_API_URL` = your Render address, with no trailing slash.
4. **Deploy.** Copy your Vercel address.
5. Go back to Render, set `CORS_ORIGINS` to that address, and let the service restart.

`VITE_API_URL` is baked in when the site is built, so if you change it, redeploy on Vercel.

## 3. First check (5 minutes)
1. Open your Vercel address and create a patient account.
2. Add a medicine, press **Turn on alarms**, allow camera and notifications.
3. **Test alarm**, then **Test notification**. Close the tab and test again to see a closed-app alert.
4. Open the site on your phone. It is on HTTPS now, so the camera, voice and alerts work there too.

Optional demo data: in the Render shell run `python seed.py`. (Demo doses are timed from the moment you run it.)

## Things to know
- **Free tier:** a free Render web service sleeps after about 15 minutes with no traffic and takes up to a minute to wake. While it sleeps,
  **no alarms are pushed and no missed-dose or checkup alerts are sent.** The Starter instance removes the sleep. For a demo, open the site a minute early.
- **One instance only.** The timers live inside the server, so running two copies would send every alarm twice.
- **Database changes:** tables are created automatically on startup. Adding columns later needs a migration tool such as Alembic.
- **CORS** is `*` until you set `CORS_ORIGINS`. Set it in production.

## Troubleshooting
| You see | Fix |
|---|---|
| Red CORS error in the browser console | `CORS_ORIGINS` must be exactly your Vercel address (no path). Save and wait for the restart. |
| "Cannot reach the server" | The backend is waking up (wait a minute), or `VITE_API_URL` is wrong. Fix it and redeploy on Vercel. |
| Tablet photos missing | Set `PUBLIC_URL` and `VITE_API_URL`. If they vanished after a redeploy, add the disk and `DATA_DIR`. |
| Test notification says no device | Press **Turn on alarms** first. Check `VAPID_PRIVATE_KEY` is set and the build installed `pywebpush`. |
| Alerts stopped after a redeploy | The VAPID key changed. Set `VAPID_PRIVATE_KEY` (never rely on the generated file in production), then press **Turn on alarms** again on each device. |
| Render build fails on numpy or opencv | Make sure the Python version is 3.11.9. |
| Refreshing a page on Vercel gives 404 | `frontend/vercel.json` is missing. It sends every address to the app. |
