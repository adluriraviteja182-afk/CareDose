import { useEffect, useMemo, useState } from "react";
import { api, q } from "../api";
import { useApp } from "../ctx";

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Calendar() {
  const { user, patientId, tick, refresh } = useApp();
  const isP = user.role === "patient";
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [data, setData] = useState(null); const [checkups, setCheckups] = useState([]);
  const [sel, setSel] = useState(iso(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  const [f, setF] = useState({ title: "Doctor checkup", doctor: "", scheduled_at: "", notes: "" });
  const [msg, setMsg] = useState(null); const [loadErr, setLoadErr] = useState("");
  const blocked = user.role === "caregiver" && !patientId;

  const load = () => {
    if (blocked) return;
    api(`/api/calendar?month=${ym.y}-${pad(ym.m)}&${q(patientId)}`).then(setData).catch((e) => setLoadErr(e.message));
    api(`/api/checkups?${q(patientId)}`).then(setCheckups).catch(() => {});
  };
  useEffect(load, [ym, patientId, tick]);

  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m - 1, 1), n = new Date(ym.y, ym.m, 0).getDate(), lead = (first.getDay() + 6) % 7;
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  }, [ym]);

  if (blocked) return <div className="card">Choose a patient in the Family tab first.</div>;
  if (loadErr && !data) return <div className="err">{loadErr}. Make sure the backend is updated and restarted.</div>;
  if (!data) return <div className="boot"><div className="spinner" /></div>;

  const todayIso = iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const up = checkups.filter((c) => !c.done && c.days_left >= 0).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const next = up[0];
  const move = (d) => { const t = new Date(ym.y, ym.m - 1 + d, 1); setYm({ y: t.getFullYear(), m: t.getMonth() + 1 }); };
  const day = data.days[sel] || { doses: [], starts: [], ends: [], checkups: [] };

  async function add(e) {
    e.preventDefault(); setMsg(null);
    try { await api("/api/checkups", { method: "POST", body: f }); setF({ title: "Doctor checkup", doctor: "", scheduled_at: "", notes: "" }); setMsg({ k: "ok", t: "Checkup saved. You will get a reminder the day before." }); load(); refresh(); }
    catch (x) { setMsg({ k: "err", t: x.message }); }
  }
  const done = async (c) => { const r = await api(`/api/checkups/${c.id}/done`, { method: "POST" }); if (r.points_awarded) setMsg({ k: "ok", t: `Well done for going. +${r.points_awarded} points!` }); load(); refresh(); };
  const del = async (c) => { if (confirm("Delete this checkup?")) { await api(`/api/checkups/${c.id}`, { method: "DELETE" }); load(); refresh(); } };
  const dots = (info) => info.doses.slice(0, 6).map((d, i) => <i key={i} className={`dt ${d.status}`} />);

  return (
    <>
      <h1>Calendar</h1>

      <div className="section-title"><h2>Your courses</h2></div>
      {data.courses.length === 0 && <div className="card muted">No medicines yet.</div>}
      {data.courses.map((c) => (
        <div className="card course" key={c.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div><h3 style={{ margin: 0, fontFamily: "var(--body)" }}>{c.medicine} <span className="muted" style={{ fontWeight: 400 }}>· {c.dosage}</span></h3>
              <div className="muted">{new Date(c.start + "T00:00").toLocaleDateString([], { day: "numeric", month: "short" })} to {new Date(c.end + "T00:00").toLocaleDateString([], { day: "numeric", month: "short" })} · {c.total_days} days</div></div>
            <span className={`chip ${c.state === "finished" ? "taken" : c.days_left === 0 ? "due" : "pending"}`}>
              {c.state === "upcoming" ? `Starts ${c.start}` : c.state === "finished" ? "Finished ✓" : c.days_left === 0 ? "Last day" : `${c.days_left} day${c.days_left > 1 ? "s" : ""} left`}</span>
          </div>
          {c.total_days <= 14
            ? <div className="daydots" aria-label={`Day ${c.day_no} of ${c.total_days}`}>{Array.from({ length: c.total_days }, (_, i) => <span key={i} className={i + 1 < c.day_no ? "done" : i + 1 === c.day_no ? "now" : ""}>{i + 1}</span>)}</div>
            : <div className="progress"><i style={{ width: `${(c.day_no / c.total_days) * 100}%` }} /></div>}
          <div className="muted" style={{ fontSize: ".9rem" }}>Day {c.day_no} of {c.total_days} · {c.taken} doses taken{c.missed ? `, ${c.missed} missed` : ""}</div>
        </div>))}

      <div className="section-title"><h2>🩺 Next checkup</h2></div>
      <div className={`card checkup ${next && next.days_left <= 2 ? "soon" : ""}`}>
        {next ? (
          <div className="row">
            <div className="datebox"><b>{new Date(next.scheduled_at).getDate()}</b><span>{new Date(next.scheduled_at).toLocaleDateString([], { month: "short" })}</span></div>
            <div className="grow"><h3 style={{ margin: 0, fontFamily: "var(--body)" }}>{next.title}</h3>
              <div className="muted">{next.doctor && `${next.doctor} · `}{new Date(next.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{next.notes && ` · ${next.notes}`}</div>
              <b>{next.days_left === 0 ? "Today" : next.days_left === 1 ? "Tomorrow" : `In ${next.days_left} days`}</b></div>
            {isP && <button onClick={() => done(next)}>I went ✓</button>}
          </div>) : <p className="muted" style={{ margin: 0 }}>No checkup planned. {isP ? "Add one below so you never forget." : ""}</p>}
        {msg && <div className={msg.k} role="status">{msg.t}</div>}
      </div>

      {isP && <form className="card" onSubmit={add}>
        <h3 style={{ fontFamily: "var(--body)" }}>Add a checkup</h3>
        <div className="grid">
          <div><label htmlFor="ct">What for</label><input id="ct" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label htmlFor="cd">Doctor</label><input id="cd" value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })} placeholder="Dr. Sharma" /></div>
        </div>
        <label htmlFor="cw">Date and time</label><input id="cw" type="datetime-local" required value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} />
        <label htmlFor="cn">Note (optional)</label><input id="cn" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Bring blood reports" />
        <p style={{ marginTop: ".9rem" }}><button>Save checkup</button></p>
      </form>}

      {up.length > 1 && <div className="card"><h3 style={{ fontFamily: "var(--body)" }}>Later checkups</h3>
        {up.slice(1).map((c) => <div className="row" key={c.id} style={{ padding: ".3rem 0" }}>
          <span className="grow">{c.title}{c.doctor && ` · ${c.doctor}`} <span className="muted">· {new Date(c.scheduled_at).toLocaleDateString([], { day: "numeric", month: "short" })}</span></span>
          {isP && <button className="danger" onClick={() => del(c)}>Delete</button>}</div>)}</div>}

      <div className="section-title"><h2>{new Date(ym.y, ym.m - 1).toLocaleDateString([], { month: "long", year: "numeric" })}</h2>
        <span className="row"><button className="ghost" aria-label="Previous month" onClick={() => move(-1)}>‹</button><button className="ghost" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() + 1 }); setSel(todayIso); }}>Today</button><button className="ghost" aria-label="Next month" onClick={() => move(1)}>›</button></span></div>
      <div className="card" style={{ padding: ".8rem" }}>
        <div className="cal">
          {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const key = iso(ym.y, ym.m, d), info = data.days[key] || { doses: [], starts: [], ends: [], checkups: [] };
            return (
              <button key={key} className={`cell ${key === todayIso ? "today" : ""} ${key === sel ? "sel" : ""}`} onClick={() => setSel(key)} aria-label={`${key}: ${info.doses.length} doses`}>
                <span className="n">{d}</span>
                <span className="dts">{dots(info)}</span>
                <span className="ev">{info.checkups.length > 0 && "🩺"}{info.ends.length > 0 && "🏁"}{info.starts.length > 0 && "▶"}</span>
              </button>);
          })}
        </div>
        <div className="legend"><span><i className="dt taken" /> Taken</span><span><i className="dt missed" /> Missed</span><span><i className="dt pending" /> Coming up</span><span>🏁 Last day of a course</span><span>🩺 Checkup</span></div>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--body)" }}>{new Date(sel + "T00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</h3>
        {day.ends.map((m) => <div className="warn" key={m}>🏁 Last day of {m}</div>)}
        {day.starts.map((m) => <div className="ok" key={m}>▶ {m} course starts</div>)}
        {day.checkups.map((c) => <div className="warn" key={c.id}>🩺 {c.title}{c.doctor && ` with ${c.doctor}`} at {c.time}{c.done ? " ✓" : ""}</div>)}
        {day.doses.length === 0 && !day.ends.length && !day.checkups.length && !day.starts.length && <p className="muted">Nothing planned for this day.</p>}
        {day.doses.map((d) => <div className="row" key={d.id} style={{ padding: ".3rem 0", justifyContent: "space-between" }}>
          <span><b>{d.time}</b> · {d.medicine} <span className="muted">{d.dosage}</span></span><span className={`chip ${d.status}`}>{d.status}</span></div>)}
      </div>
    </>
  );
}
