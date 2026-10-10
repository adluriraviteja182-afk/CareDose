import { useEffect, useState } from "react";
import { api, openFile } from "../api";

export default function Review() {
  const [rows, setRows] = useState([]);
  const load = () => api("/api/conflicts").then(setRows);
  useEffect(() => { load(); }, []);
  const view = async (c) => { const docs = await api(`/api/prescription-docs?patient_id=${c.patient_id}`); docs.length ? openFile(`/api/prescription-docs/${docs[0].id}/file`) : alert("This patient has not uploaded a prescription."); };
  const done = async (id) => { await api(`/api/conflicts/${id}/resolve`, { method: "POST" }); load(); };
  return (
    <>
      <h1>Review queue</h1>
      <p className="muted">Prescriptions with overlapping times or missing details. Mark each as reviewed once you have checked it with the patient.</p>
      {rows.length === 0 && <div className="card">Nothing to review.</div>}
      {rows.map((c) => (
        <div className="card row" key={c.id}>
          <div className="grow"><span className={`chip ${c.kind === "incomplete" ? "missed" : "pending"}`}>{c.kind === "overlap" ? "Overlap" : c.kind === "ai_read" ? "Verify AI reading" : "Incomplete"}</span>
            <h3>{c.patient}</h3><p>{c.detail}</p></div>
          {c.kind === "ai_read" && <button className="ghost" onClick={() => view(c)}>View prescription</button>}
          <button onClick={() => done(c.id)}>Mark reviewed</button>
        </div>))}
    </>
  );
}