import { useEffect, useMemo, useState } from "react";
import { api, q } from "../api";
import { useApp } from "../ctx";
import { Icon } from "../components.jsx";

const BADGES = [
  ["First Dose", "💊", "Take your first dose"], ["3-Day Streak", "🔥", "Take medicine 3 days in a row"], ["7-Day Streak", "⚡", "Take medicine 7 days in a row"],
  ["Two-Week Hero", "🏆", "A 14-day streak"], ["100 Points", "💯", "Collect 100 points"], ["Camera Verified", "📷", "Verify a tablet with the camera"],
  ["Course Complete", "🏁", "Finish a medicine course"], ["Checkup Done", "🩺", "Go to a checkup"],
];
const COLORS = ["#0f766e", "#f2b134", "#d9480f", "#2f6fdd", "#8b5cf6", "#1b7f46"];

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ x: Math.random() * 100, d: 0.6 + Math.random() * 1.6, r: Math.random() * 360, c: COLORS[i % COLORS.length], w: 6 + Math.random() * 8 })), []);
  return <div className="confetti" aria-hidden>{bits.map((b, i) => <i key={i} style={{ left: `${b.x}vw`, background: b.c, width: b.w, height: b.w * 1.6, animationDuration: `${b.d + 1.2}s`, transform: `rotate(${b.r}deg)` }} />)}</div>;
}

export default function Play() {
  const { user, t, patientId, tick, refresh } = useApp();
  const [d, setD] = useState(null); const [ch, setCh] = useState([]); const [board, setBoard] = useState([]);
  const [win, setWin] = useState(null); const [err, setErr] = useState("");
  const isP = user.role === "patient", blocked = user.role === "caregiver" && !patientId;

  const load = () => {
    if (blocked) return;
    api(`/api/dashboard?${q(patientId)}`).then(setD).catch((e) => setErr(e.message));
    api(`/api/challenges?${q(patientId)}`).then(setCh).catch((e) => setErr(e.message));
    api("/api/leaderboard").then(setBoard).catch(() => {});
  };
  useEffect(load, [patientId, tick]);
  useEffect(() => { if (win) { const id = setTimeout(() => setWin(null), 3800); return () => clearTimeout(id); } }, [win]);

  async function claim(c) {
    setErr("");
    try { const r = await api(`/api/challenges/${c.key}/claim`, { method: "POST" }); setWin({ ...r, burst: Date.now() }); load(); refresh(); }
    catch (e) { setErr(e.message); }
  }
  if (blocked) return <div className="card">Choose a patient in the Family tab first.</div>;
  if (err && !d) return <div className="err">{err}. Make sure the backend is updated and restarted.</div>;
  if (!d) return <div className="boot"><div className="spinner" /></div>;

  const lp = d.level_progress || { level: d.level, next_level: null, pct: 100, to_go: 0 };
  const group = (kind, title, sub) => {
    const list = ch.filter((c) => c.kind === kind);
    return list.length === 0 ? null : (
      <>
        <div className="section-title"><h2>{title}</h2><span className="muted">{sub}</span></div>
        {list.map((c) => (
          <div className={`chal ${c.status}`} key={c.key}>
            <span className={`ico ${c.status === "claimed" ? "green" : c.status === "claimable" ? "amber" : "teal"}`}><Icon name={c.icon} size={26} /></span>
            <div className="grow">
              <div className="row" style={{ justifyContent: "space-between", gap: ".4rem" }}><b>{c.title}</b><span className="reward">+{c.points}</span></div>
              <div className="muted">{c.description}</div>
              <div className="progress"><i style={{ width: `${(c.progress / c.target) * 100}%` }} /></div>
              <div className="muted" style={{ fontSize: ".85rem" }}>{c.progress} / {c.target}</div>
            </div>
            {c.status === "claimable" && isP && <button className="claim" onClick={() => claim(c)}>Collect</button>}
            {c.status === "claimable" && !isP && <span className="chip due">Ready</span>}
            {c.status === "claimed" && <span className="chip taken">Collected ✓</span>}
          </div>))}
      </>);
  };

  return (
    <>
      {win && <><Confetti key={win.burst} /><div className="wintoast" role="status"><div style={{ fontSize: "2.4rem" }}>🎉</div><b>{win.title}</b><div>+{win.points_awarded} points</div></div></>}
      <h1>Rewards</h1>
      {err && <div className="err" role="alert">{err}</div>}

      <div className="levelcard rise">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><div className="eyebrow" style={{ color: "#bfe6e0" }}>Level</div><h2 style={{ margin: 0, fontSize: "1.9rem" }}>{lp.level}</h2></div>
          <div style={{ textAlign: "right" }}><div className="bigpts">{d.points}</div><div style={{ opacity: .85 }}>points</div></div>
        </div>
        <div className="progress light"><i style={{ width: `${lp.pct}%` }} /></div>
        <div style={{ opacity: .9 }}>{lp.next_level ? `${lp.to_go} points to ${lp.next_level}` : "You reached the top level!"}</div>
        <div className="row" style={{ marginTop: ".7rem" }}>
          <span className="flame">🔥 {d.streak}-day streak</span><span className="flame">⭐ Best {d.best_streak}</span>
        </div>
      </div>

      {group("daily", "Today's challenges", "resets every day")}
      {group("weekly", "This week", "resets on Monday")}
      {group("milestone", "Milestones", "one-time rewards")}

      <div className="section-title"><h2>Badges</h2><span className="muted">{d.badges.length} of {BADGES.length}</span></div>
      <div className="badges">
        {BADGES.map(([name, emoji, hint]) => { const on = d.badges.includes(name);
          return <div key={name} className={`bdg ${on ? "on" : ""}`} title={hint}><span>{on ? emoji : "🔒"}</span><b>{name}</b><small>{hint}</small></div>; })}
      </div>

      {board.length > 1 && <div className="card" style={{ marginTop: "1rem" }}><h2>{t("leaderboard")}</h2>
        {board.map((r, i) => <div key={r.name} className="row" style={{ justifyContent: "space-between", padding: ".25rem 0" }}><span>{["🥇", "🥈", "🥉"][i] || `${i + 1}.`} {r.name}</span><b>{r.points} {t("points")}</b></div>)}</div>}
    </>
  );
}