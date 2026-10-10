import { useEffect, useState } from "react";
import { api, q } from "../api";
import { useApp } from "../ctx";

export default function Report() {
  const { t, patientId, user, tick } = useApp();
  const [period, setPeriod] = useState("weekly"); const [r, setR] = useState(null);
  useEffect(() => {
    if (user.role === "caregiver" && !patientId) return;
    api(`/api/report?period=${period}&${q(patientId)}`).then(setR);
  }, [period, patientId, tick]);
  if (user.role === "caregiver" && !patientId) return <div className="card">Choose a patient in the Family tab first.</div>;
  if (!r) return null;
  const days = r.days.filter((d) => d.taken + d.missed > 0);
  const max = Math.max(1, ...days.map((d) => d.taken + d.missed));
  return (
    <>
      <h1>{t("report")}</h1>
      <div className="tabs">{["daily", "weekly", "monthly"].map((p) => <button key={p} className={p === period ? "" : "ghost"} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>
      <div className="card">
        <div className="big-pct">{r.percentage}%</div><div className="muted">{t("adherence")}</div>
        <p style={{ marginTop: ".6rem" }}>{r.taken} {t("taken").toLowerCase()} · {r.missed} {t("missed").toLowerCase()}{r.pending ? ` · ${r.pending} waiting` : ""}</p>
      </div>
      <div className="card">
        <h2>Day by day</h2>
        {days.length === 0 ? <p className="muted">Nothing to chart yet. Bars appear after your first taken or missed dose.</p> :
          <div className="bars" role="img" aria-label="Taken and missed doses per day">
            {days.map((d) => <div className="bcol" key={d.date} title={`${d.date}: ${d.taken} taken, ${d.missed} missed`}>
              <div className="bar-wrap"><div className="bar" style={{ height: `${((d.taken + d.missed) / max) * 100}%` }}><i className="t" style={{ flex: d.taken }} /><i className="m" style={{ flex: d.missed }} /></div></div>
              <small>{new Date(d.date + "T00:00").toLocaleDateString([], { day: "numeric", month: "short" })}</small>
            </div>)}
          </div>}
        <p className="muted" style={{ marginTop: ".5rem" }}>Green: taken. Red: missed.</p>
      </div>
    </>
  );
}