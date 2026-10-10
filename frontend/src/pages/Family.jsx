import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../ctx";
import { PermissionPrompt } from "../components.jsx";

export default function Family() {
  const { user, patientId, choosePatient, tick } = useApp();
  const [links, setLinks] = useState([]); const [email, setEmail] = useState(""); const [msg, setMsg] = useState(null); const [notes, setNotes] = useState([]);
  const load = () => { api("/api/links").then(setLinks); api("/api/notifications").then(setNotes); };
  useEffect(() => { load(); }, [tick]);

  async function request(e) {
    e.preventDefault();
    try { await api("/api/caregiver/link", { method: "POST", body: { patient_email: email } }); setMsg({ k: "ok", t: "Request sent. The patient must approve it." }); setEmail(""); load(); }
    catch (x) { setMsg({ k: "err", t: x.message }); }
  }
  const consent = async (id, v) => { await api(`/api/links/${id}/consent`, { method: "POST", body: { consent: v } }); load(); };

  return (
    <>
      <h1>Family</h1>
      {user.role !== "clinician" && <PermissionPrompt camera={false} />}
      {user.role === "caregiver" && <form className="card" onSubmit={request}>
        <h2>Follow a patient</h2><label htmlFor="pe">Patient's email</label><input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {msg && <div className={msg.k} role="status">{msg.t}</div>}<p style={{ marginTop: ".8rem" }}><button>Send request</button></p>
      </form>}
      <div className="card"><h2>{user.role === "patient" ? "People who follow you" : "Patients"}</h2>
        {links.length === 0 && <p className="muted">Nobody yet.</p>}
        {links.map((l) => (
          <div className="row" key={l.id} style={{ padding: ".5rem 0" }}>
            <div className="grow"><b>{l.person.name}</b><div className="muted">{l.person.email} · {l.consent ? "Approved" : "Waiting for approval"}</div></div>
            {user.role === "patient" && !l.consent && <button onClick={() => consent(l.id, true)}>Approve</button>}
            {user.role === "patient" && <button className="danger" onClick={() => consent(l.id, false)}>{l.consent ? "Remove access" : "Decline"}</button>}
            {user.role === "caregiver" && l.consent && <button className={patientId === l.person.id ? "" : "ghost"} onClick={() => choosePatient(l.person.id)}>{patientId === l.person.id ? "Viewing" : "View"}</button>}
          </div>))}
      </div>
      <div className="card"><h2>Alerts</h2>
        {notes.length === 0 && <p className="muted">No alerts.</p>}
        {notes.map((n) => <p key={n.id}>{n.message} <span className="muted">{new Date(n.created_at).toLocaleString()}</span></p>)}
      </div>
    </>
  );
}