import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, q, timeOf } from "../api";
import { useApp } from "../ctx";
import { DoseCard, CameraCheck, PillImg, Ring, PermissionPrompt, isDue } from "../components.jsx";

export default function Dashboard() {
  const { user, t, patientId, tick, refresh } = useApp();
  const [d, setD] = useState(null); const [board, setBoard] = useState([]); const [chal, setChal] = useState([]); const [cam, setCam] = useState(null);
  const [toast, setToast] = useState(""); const [err, setErr] = useState("");
  const [water, setWater] = useState(localStorage.getItem("cd_water") === "1");
  const [now, setNow] = useState(Date.now());
  const isC = user.role === "caregiver", isP = user.role === "patient";

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (isC && !patientId) return;
    api(`/api/dashboard?${q(patientId)}`).then(setD).catch((e) => setErr(e.message));
    api("/api/leaderboard").then(setBoard).catch(() => {});
    api(`/api/challenges?${q(patientId)}`).then(setChal).catch(() => {});
  }, [patientId, tick]);

  if (isC && !patientId) return <div className="card"><h2>{t("family")}</h2><p>Choose a patient in the Family tab to see their day.</p></div>;
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="boot"><div className="spinner" /></div>;

  const hour = new Date().getHours();
  const greet = t(hour < 12 ? "greetMorning" : hour < 17 ? "greetAfternoon" : "greetEvening");
  const first = d.patient.name.split(" ")[0];
  const pending = d.today.filter((x) => x.status === "pending");
  const next = pending[0] || d.upcoming[0];
  const mins = next ? Math.round((new Date(next.scheduled_at) - now) / 60000) : null;
  const due = next && isDue(next);
  const when = !next ? "" : due ? t("dueNow") : mins < 60 ? t("inMin", { n: Math.max(mins, 1) }) : timeOf(next.scheduled_at);
  const toggleWater = () => { const v = !water; setWater(v); localStorage.setItem("cd_water", v ? "1" : "0"); };

  return (
    <>
      <div className="greet rise">
        <div className="eyebrow">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>{isC ? d.patient.name : `${greet}, ${first}`}</h1>
      </div>
      {isP && <PermissionPrompt />}
      {toast && <div className="ok" role="status">{toast}</div>}

      <div className="hero">
        <section className={`next rise ${due ? "due" : ""}`} aria-label={t("nextDose")}>
          <div className="eyebrow">{t("nextDose")}</div>
          {next ? <>
            <div className="next-body">
              <PillImg url={next.image_url} />
              <div>
                <h2>{next.medicine}</h2>
                <div style={{ opacity: .9 }}>{next.dosage}</div>
                <div className="big-time">{when}</div>
              </div>
            </div>
            {isP && due && <button className="big" onClick={() => setCam(next)}>{t("takeMedicine")}</button>}
            {isP && !due && <div style={{ opacity: .85 }}>{timeOf(next.scheduled_at)}</div>}
          </> : <h2 style={{ marginTop: ".8rem" }}>{t("allDone")} ✓</h2>}
        </section>
        <section className="card ring-card rise" style={{ animationDelay: "80ms", marginBottom: 0 }}>
          <Ring pct={d.adherence} />
          <div style={{ marginTop: ".6rem" }}><b>{t("adherence")}</b><div className="muted">{d.level}</div></div>
        </section>
      </div>

      <div className="tiles">
        <div className="tile rise"><b>{d.taken}</b><span>{t("taken")}</span></div>
        <div className="tile rise" style={{ animationDelay: "60ms" }}><b>{d.missed}</b><span>{t("missed")}</span></div>
        <div className="tile rise" style={{ animationDelay: "120ms" }}><b>{d.points}</b><span>{t("points")} · {d.streak} {t("streak").toLowerCase()}</span></div>
      </div>

      {d.checkup && (
        <Link to="/calendar" className={`insight ${d.checkup.days_left <= 2 ? "soon" : ""}`}>
          <span className="ico coral" style={{ fontSize: "1.6rem" }}>🩺</span>
          <div className="grow"><b>{d.checkup.title}{d.checkup.doctor && ` · ${d.checkup.doctor}`}</b>
            <div className="muted">{new Date(d.checkup.scheduled_at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div>
          <span className="chip due">{d.checkup.days_left === 0 ? "Today" : d.checkup.days_left === 1 ? "Tomorrow" : `In ${d.checkup.days_left} days`}</span>
        </Link>)}

      {(d.courses || []).length > 0 && <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Your courses</h2><Link to="/calendar">Calendar</Link></div>
        {(d.courses || []).map((c) => <div key={c.id} style={{ marginTop: ".7rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>{c.medicine}</b>
            <span className="muted">{c.state === "upcoming" ? "Starts soon" : c.days_left === 0 ? "Last day today" : `${c.days_left} day${c.days_left > 1 ? "s" : ""} left`}</span></div>
          <div className="progress"><i style={{ width: `${(c.day_no / c.total_days) * 100}%` }} /></div></div>)}
      </div>}

      {chal.filter((c) => c.status !== "claimed" && c.kind !== "milestone").slice(0, 2).length > 0 && <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>🎯 Challenges</h2><Link to="/rewards">All rewards</Link></div>
        {chal.filter((c) => c.status !== "claimed" && c.kind !== "milestone").slice(0, 2).map((c) => <div key={c.key} style={{ marginTop: ".7rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>{c.title}</b>{c.status === "claimable" ? <span className="chip due">Collect +{c.points}</span> : <span className="reward">+{c.points}</span>}</div>
          <div className="progress"><i style={{ width: `${(c.progress / c.target) * 100}%` }} /></div>
          <div className="muted" style={{ fontSize: ".85rem" }}>{c.description} · {c.progress}/{c.target}</div></div>)}
      </div>}

      <div className="section-title"><h2>{t("today")}</h2></div>
      {d.today.length === 0 ? <div className="card">{t("nothingToday")}</div>
        : d.today.map((x, i) => <DoseCard key={x.id} i={i} d={x} onTake={isP ? setCam : null} />)}

      {d.badges.length > 0 && <div className="card"><h2>{t("badges")}</h2>{d.badges.map((b) => <span className="badge" key={b}>🏅 {b}</span>)}</div>}
      {board.length > 1 && <div className="card"><h2>{t("leaderboard")}</h2>
        {board.map((r, i) => <div key={r.name} className="row" style={{ justifyContent: "space-between", padding: ".25rem 0" }}><span>{i + 1}. {r.name}</span><b>{r.points} {t("points")}</b></div>)}</div>}

      <div className="card">
        <h2>{t("diet")}</h2>
        <div className="grid">
          <div><h3 style={{ color: "var(--green)" }}>✓ {t("eat")}</h3><ul className="plain">{d.diet.eat.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><h3 style={{ color: "var(--red)" }}>✕ {t("avoid")}</h3><ul className="plain">{d.diet.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <p className="muted" style={{ marginTop: ".7rem" }}>💧 {d.diet.water_glasses_per_day} glasses of water a day. {d.diet.disclaimer}</p>
        {isP && <label className="row" style={{ fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 24, minHeight: 24 }} checked={water} onChange={toggleWater} /> {t("water")}</label>}
      </div>
      {cam && <CameraCheck dose={cam} onCancel={() => setCam(null)} onDone={(m) => { setCam(null); setToast(m); refresh(); }} />}
    </>
  );
}
