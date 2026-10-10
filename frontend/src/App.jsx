import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "./api";
import { Ctx } from "./ctx";
import { LANGS, makeT, speak } from "./i18n";
import { CameraCheck, Icon } from "./components.jsx";
import { unlockAudio } from "./alarm";
import { ensurePush, showNotice } from "./push";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Prescriptions from "./pages/Prescriptions.jsx";
import Chat from "./pages/Chat.jsx";
import Report from "./pages/Report.jsx";
import Family from "./pages/Family.jsx";
import Review from "./pages/Review.jsx";
import Calendar from "./pages/Calendar.jsx";
import Play from "./pages/Play.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [patientId, setPatientId] = useState(() => Number(localStorage.getItem("cd_patient")) || null);
  const [tick, setTick] = useState(0); // bump to refresh data after an action
  const [camDose, setCamDose] = useState(null); // {dose, reminder}
  const shown = useRef(new Set());
  const nav = useNavigate();
  const lang = user?.language || localStorage.getItem("cd_lang") || "en";
  const t = useMemo(() => makeT(lang), [lang]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!getToken()) return setReady(true);
    api("/api/me").then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  const choosePatient = (id) => { setPatientId(id); id ? localStorage.setItem("cd_patient", id) : localStorage.removeItem("cd_patient"); refresh(); };

  async function changeLang(l) { localStorage.setItem("cd_lang", l); setUser(await api("/api/me", { method: "PUT", body: { language: l } })); }
  const logout = () => { setToken(null); setUser(null); choosePatient(null); nav("/"); };

  // Browsers keep sound locked until the first tap. Unlock it so the alarm can ring later.
  useEffect(() => {
    const u = () => unlockAudio();
    window.addEventListener("pointerdown", u, { once: true }); window.addEventListener("keydown", u, { once: true });
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, []);

  // If alerts were already allowed, make sure this device is registered for background alerts.
  useEffect(() => {
    if (user && user.role !== "clinician" && "Notification" in window && Notification.permission === "granted") ensurePush();
  }, [user]);

  // Reminder watcher (patients): checks for due doses every 20s, and instantly when a push arrives or the tab is shown.
  useEffect(() => {
    if (user?.role !== "patient") return;
    const check = async () => {
      try {
        const doses = await api("/api/doses/due");
        const next = doses.find((d) => !shown.current.has(d.id));
        if (next) {
          shown.current.add(next.id);
          setCamDose((cur) => cur || { dose: next, reminder: true }); // camera + alarm start by themselves
          speak(`${t("timeFor")}. ${next.medicine}. ${next.dosage}`, lang);
          if (document.hidden) showNotice(t("timeFor"), { body: `${next.medicine} · ${next.dosage}`, icon: next.image_url || undefined, tag: `dose-${next.id}`, data: { url: "/" } });
        }
      } catch {}
    };
    const onVisible = () => { if (!document.hidden) check(); };
    const onMsg = () => check();
    check(); const id = setInterval(check, 20000);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, [user, lang, t]);

  // Optional hourly water reminder (toggle lives on the dashboard).
  useEffect(() => {
    if (user?.role !== "patient") return;
    const id = setInterval(() => {
      const h = new Date().getHours();
      if (localStorage.getItem("cd_water") === "1" && h >= 8 && h <= 20) speak(t("remindDrink"), lang);
    }, 2 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, lang, t]);

  if (!ready) return <div className="boot"><div className="spinner" role="status" aria-label="Loading" /></div>;
  const ctx = { user, setUser, t, lang, patientId, choosePatient, tick, refresh };
  if (!user) return <Ctx.Provider value={ctx}><Auth /></Ctx.Provider>;

  const isP = user.role === "patient", isC = user.role === "caregiver", isK = user.role === "clinician";
  return (
    <Ctx.Provider value={ctx}>
      <header className="top"><div className="top-in">
        <span className="brand"><span className="logo"><Icon name="pill" size={22} /></span><span>CareDose</span></span>
        <nav className="nav" aria-label="Main">
          {!isK && <NavLink to="/" end><Icon name="home" />{t("today")}</NavLink>}
          {isP && <NavLink to="/medicines"><Icon name="pill" />{t("medicines")}</NavLink>}
          {!isK && <NavLink to="/calendar"><Icon name="calendar" />{t("calendar")}</NavLink>}
          {!isK && <NavLink to="/rewards"><Icon name="star" />{t("rewards")}</NavLink>}
          {!isK && <NavLink to="/chat"><Icon name="chat" />{t("chat")}</NavLink>}
          {!isK && <NavLink to="/report"><Icon name="chart" />{t("report")}</NavLink>}
          {!isK && <NavLink to="/family"><Icon name="users" />{t("family")}</NavLink>}
          {isK && <NavLink to="/review" end><Icon name="shield" />{t("review")}</NavLink>}
        </nav>
        <select value={lang} onChange={(e) => changeLang(e.target.value)} aria-label="Language">
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="icon-btn" onClick={logout} aria-label={t("logout")} title={t("logout")}><Icon name="logout" /></button>
      </div></header>
      <main className="shell">
        <Routes>
          <Route path="/" element={isK ? <Navigate to="/review" /> : <Dashboard />} />
          <Route path="/medicines" element={isP ? <Prescriptions /> : <Navigate to="/" />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/rewards" element={<Play />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/report" element={<Report />} />
          <Route path="/family" element={<Family />} />
          <Route path="/review" element={<Review />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {camDose && <CameraCheck dose={camDose.dose} reminder={camDose.reminder} onCancel={() => setCamDose(null)}
        onSnooze={camDose.reminder ? () => { const id = camDose.dose.id; setCamDose(null); setTimeout(() => shown.current.delete(id), 10 * 60 * 1000); } : null} onDone={(m) => { setCamDose(null); speak(m, lang); refresh(); }} />}
    </Ctx.Provider>
  );
}