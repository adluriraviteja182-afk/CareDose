import { useEffect, useRef, useState } from "react";
import { api, timeOf } from "./api";
import { startAlarm, stopAlarm, unlockAudio, audioReady } from "./alarm";
import { ensurePush } from "./push";
import { useApp } from "./ctx";

const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  pill: "M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z M8.5 8.5l7 7",
  chat: "M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6A8 8 0 1 1 21 12z",
  chart: "M5 20V11 M12 20V4 M19 20v-6 M3 20h18",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4 M16 17l5-5-5-5 M21 12H9",
  calendar: "M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  star: "M12 2l3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  trophy: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18",
  leaf: "M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z M4 21c3-5 6-8 10-10",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  check: "M5 13l4 4L19 7",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M19 11a7 7 0 0 1-14 0 M12 18v3",
  code: "M16 18l6-6-6-6 M8 6l-6 6 6 6",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
};
export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
);

export function PillImg({ url }) {
  return url ? <img className="pill-img" src={url} alt="Tablet" /> : <div className="pill-img" aria-hidden>💊</div>;
}

export function Ring({ pct, size = 132, stroke = 12 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${pct}%`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dcece8" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0f766e" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <b>{pct}%</b>
    </div>
  );
}

export const isDue = (d) => d.status === "pending" && new Date(d.scheduled_at) <= new Date();

// The camera opens by itself as soon as this appears. At medicine time the app shows it automatically.
export function CameraCheck({ dose, reminder, onDone, onCancel, onSnooze }) {
  const { t } = useApp();
  const video = useRef(); const stream = useRef();
  const [live, setLive] = useState(false); const [msg, setMsg] = useState(""); const [fails, setFails] = useState(0);
  const [busy, setBusy] = useState(false); const [camErr, setCamErr] = useState("");
  const [ring, setRing] = useState(!!reminder); const [locked, setLocked] = useState(false);

  // At medicine time: ring the alarm. It stops when this screen closes, or after a minute.
  useEffect(() => {
    if (!reminder) return;
    startAlarm(60000); setLocked(!audioReady());
    const off = setTimeout(() => setRing(false), 60000);
    const poll = setInterval(() => setLocked(!audioReady()), 800);
    return () => { clearTimeout(off); clearInterval(poll); stopAlarm(); };
  }, [reminder]);

  useEffect(() => {
    let stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr("This browser cannot open the camera here. Use localhost or HTTPS."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((x) => x.stop());
        stream.current = s; video.current.srcObject = s; video.current.play().catch(() => {});
      })
      .catch(() => setCamErr("Camera is blocked or not available. Allow camera access in the browser address bar, or confirm without the camera."));
    return () => { stopped = true; stream.current?.getTracks().forEach((x) => x.stop()); };
  }, []);

  async function check() {
    setBusy(true); setMsg("");
    const v = video.current, c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(async (blob) => {
      try {
        const form = new FormData(); form.append("file", blob, "frame.jpg");
        const r = await api(`/api/doses/${dose.id}/verify`, { method: "POST", form });
        if (r.matched) return onDone(t("verified"));
        setFails((n) => n + 1); setMsg(t("tryAgain"));
      } catch (e) { setMsg(e.message); setFails((n) => n + 1); }
      setBusy(false);
    }, "image/jpeg", 0.9);
  }
  async function manual() { await api(`/api/doses/${dose.id}/taken`, { method: "POST" }); onDone("Dose marked as taken."); }

  return (
    <div className="overlay" role="dialog" aria-label={t("timeFor")}><div className="sheet">
      <div className="sheet-head">
        {reminder && <span className="live-dot" aria-hidden />}
        <h1>{reminder ? t("timeFor") : t("takeMedicine")}</h1>
      </div>
      {reminder && ring && (
        <div className="ringbar" role="status">
          <span>🔔 {locked ? "Tap anywhere to turn the alarm sound on" : "Alarm ringing"}</span>
          <button className="ghost" onClick={() => { unlockAudio(); if (!locked) { stopAlarm(); setRing(false); } }}>{locked ? "Turn on sound" : "Silence"}</button>
        </div>)}
      <div className="cam-grid">
        <div className="ref">
          <div className="eyebrow">{t("yourTablet")}</div>
          <PillImg url={dose.image_url} />
          <h2>{dose.medicine}</h2>
          <p className="muted" style={{ margin: 0 }}>{dose.dosage}</p>
          <p style={{ fontFamily: "var(--display)", fontSize: "1.6rem", fontWeight: 700, margin: ".4rem 0 0" }}>{timeOf(dose.scheduled_at)}</p>
        </div>
        <div>
          <div className="video-box">
            <video ref={video} playsInline muted autoPlay onLoadedData={() => setLive(true)} />
            {!live && !camErr && <div style={{ display: "grid", gap: ".6rem", justifyItems: "center", position: "relative" }}><div className="spinner" /><span>{t("cameraStarting")}</span></div>}
            {live && <><div className="target" /><div className="scan" /></>}
          </div>
          <p className="muted" style={{ margin: ".6rem 0" }}>{t("holdTablet")}</p>
          {camErr && <div className="warn">{camErr}</div>}
          {msg && <div className="err" role="alert">{msg}</div>}
          <div className="row">
            <button className="big grow" onClick={check} disabled={busy || !live}><Icon name="camera" /> {busy ? "…" : t("checkTablet")}</button>
            <button className="ghost big" onClick={onCancel}>{t("laterBtn")}</button>
          </div>
          {onSnooze && <p style={{ marginTop: ".6rem" }}><button className="ghost" onClick={onSnooze}>⏰ Remind me in 10 minutes</button></p>}
          {(fails >= 2 || camErr) && <p style={{ marginTop: ".8rem" }}><button className="ghost" onClick={manual}>{t("confirmManual")}</button></p>}
        </div>
      </div>
    </div></div>
  );
}

export function DoseCard({ d, onTake, i = 0 }) {
  const { t } = useApp();
  const due = isDue(d);
  const state = due ? "due" : d.status;
  return (
    <div className={`dose ${state}`} style={{ animationDelay: `${i * 60}ms` }}>
      <PillImg url={d.image_url} />
      <div>
        <h3>{d.medicine}</h3>
        <div className="muted">{d.dosage}{d.notes ? ` · ${d.notes}` : ""}</div>
        <span className={`chip ${state}`}>{due ? t("dueNow") : t(d.status === "pending" ? "upcoming" : d.status)}{d.verified ? " ✓" : ""}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="when">{timeOf(d.scheduled_at)}</div>
        {d.status === "pending" && onTake && <button onClick={() => onTake(d)}>{t("takeMedicine")}</button>}
      </div>
    </div>
  );
}

// One button turns on everything the alarm needs: camera, sound, notifications and background alerts.
export function PermissionPrompt({ camera = true }) {
  const { t } = useApp();
  const [camOk, setCamOk] = useState(!camera);
  const [notifOk, setNotifOk] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!camera) return;
    const ask = navigator.permissions?.query ? navigator.permissions.query({ name: "camera" }) : Promise.reject();
    ask.then((p) => { setCamOk(p.state === "granted"); p.onchange = () => setCamOk(p.state === "granted"); })
       .catch(() => setCamOk(localStorage.getItem("cd_cam_ok") === "1"));
  }, [camera]);

  async function enable() {
    setMsg(null); unlockAudio();
    if (camera) {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((x) => x.stop()); localStorage.setItem("cd_cam_ok", "1"); setCamOk(true); }
      catch { setMsg({ k: "err", t: "Camera was blocked. Click the camera icon in the address bar and choose Allow." }); }
    }
    if (typeof Notification !== "undefined") {
      const perm = await Notification.requestPermission();
      setNotifOk(perm === "granted");
      if (perm === "granted") { const r = await ensurePush(); setMsg(r.ok ? { k: "ok", t: "Background alerts are on." } : { k: "warn", t: r.reason }); }
      else setMsg({ k: "err", t: "Notifications are blocked. Click the lock icon in the address bar and allow notifications." });
    }
  }
  const testAlarm = () => { unlockAudio(); startAlarm(4000); setMsg({ k: "ok", t: "You should hear the alarm for a few seconds." }); };
  async function testPush() {
    try { const r = await api("/api/push/test", { method: "POST" });
      setMsg(r.sent ? { k: "ok", t: `Test alert sent to ${r.sent} device${r.sent > 1 ? "s" : ""}. Close this tab to see it arrive.` } : { k: "warn", t: "No device is registered yet. Tap \"Turn on alarms\" first." }); }
    catch (e) { setMsg({ k: "err", t: e.message }); }
  }

  if (camOk && notifOk) return (
    <div className="statusrow">
      <span>✅ Alarm, {camera ? "camera and " : ""}alerts are on</span>
      <span className="row"><button className="ghost" onClick={testAlarm}>🔔 Test alarm</button>
      {/* <button className="ghost" onClick={testPush}>📲 Test notification</button> */}
      </span>
      {msg && <div className={msg.k} style={{ flexBasis: "100%", margin: 0 }} role="status">{msg.t}</div>}
    </div>);
  return (
    <div className="prompt">
      <Icon name="bell" size={28} />
      <div className="grow"><b>Turn on alarms</b><div>So CareDose can ring and notify you at medicine time{camera ? ", and open the camera" : ""}, even when it is closed.</div>
        {msg && <div className={msg.k} role="status">{msg.t}</div>}</div>
      <button onClick={enable}>Turn on alarms</button>
    </div>);
}