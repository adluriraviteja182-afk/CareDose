import { useEffect, useState } from "react";
import { api, openFile } from "../api";
import { useApp } from "../ctx";
import { PillImg } from "../components.jsx";

const blank = { medicine: "", dosage: "", times: ["08:00"], duration_days: 7, start_date: new Date().toISOString().slice(0, 10), notes: "" };

export default function Prescriptions() {
  const { user, tick, refresh } = useApp();
  const [list, setList] = useState([]); const [f, setF] = useState(blank); const [editId, setEditId] = useState(null);
  const [file, setFile] = useState(null); const [msg, setMsg] = useState(null); const [conditions] = useState(["general", "diabetes", "hypertension", "cholesterol", "anemia"]);
  const [cond, setCond] = useState(user.condition);
  // prescription documents
  const [docs, setDocs] = useState([]); const [drafts, setDrafts] = useState(null); const [docId, setDocId] = useState(null);
  const [dmsg, setDmsg] = useState(null); const [dbusy, setDbusy] = useState("");
  const loadDocs = () => api("/api/prescription-docs").then(setDocs).catch(() => {});
  useEffect(() => { loadDocs(); }, []);
  async function uploadDoc(e) {
    e.preventDefault(); const file = e.target.elements.doc.files[0]; if (!file) return setDmsg({ k: "warn", t: "Choose a photo or PDF first." });
    setDbusy("upload"); setDmsg(null);
    try { const form = new FormData(); form.append("file", file); await api("/api/prescription-docs", { method: "POST", form }); e.target.reset(); setDmsg({ k: "ok", t: "Prescription saved safely. Only you, your approved caregivers and your pharmacist can open it." }); loadDocs(); }
    catch (x) { setDmsg({ k: "err", t: x.message }); }
    setDbusy("");
  }
  async function readDoc(d) {
    setDbusy(`read${d.id}`); setDmsg(null); setDrafts(null);
    try { const r = await api(`/api/prescription-docs/${d.id}/read`, { method: "POST" }); setDocId(d.id); setDrafts(r.medicines); if (!r.medicines.length) setDmsg({ k: "warn", t: "No medicines found. Try a clearer photo, or type them in below." }); }
    catch (x) { setDmsg({ k: "err", t: x.message }); }
    setDbusy("");
  }
  const useDraft = (m) => { setF({ medicine: m.medicine, dosage: m.dosage, times: m.times.length ? m.times : [""], duration_days: m.duration_days || 7, start_date: new Date().toISOString().slice(0, 10), notes: m.notes }); window.scrollTo({ top: 0, behavior: "smooth" }); setMsg({ k: "warn", t: "Filled in from your prescription. Check every field against the paper, add a tablet photo, then press Save." }); };
  const delDoc = async (d) => { if (confirm("Delete this prescription file?")) { await api(`/api/prescription-docs/${d.id}`, { method: "DELETE" }); setDrafts(null); loadDocs(); } };

  const load = () => api("/api/prescriptions").then(setList);
  useEffect(() => { load(); }, [tick]);

  async function save(e) {
    e.preventDefault(); setMsg(null);
    try {
      const r = await api(editId ? `/api/prescriptions/${editId}` : "/api/prescriptions", { method: editId ? "PUT" : "POST", body: { ...f, duration_days: Number(f.duration_days), doc_id: !editId && drafts ? docId : null } });
      if (file) { const form = new FormData(); form.append("file", file); await api(`/api/prescriptions/${r.id}/image`, { method: "POST", form }); }
      setMsg(r.status === "incomplete"
        ? { k: "warn", t: `Saved, but flagged for review. Missing: ${r.missing.join(", ")}. No reminders until it is complete.` }
        : r.conflicts?.length ? { k: "warn", t: `Saved. A pharmacist will review: ${r.conflicts.join("; ")}` } : { k: "ok", t: "Saved. Reminders are scheduled." });
      setF(blank); setEditId(null); setFile(null); e.target.reset(); load(); refresh();
    } catch (x) { setMsg({ k: "err", t: x.message }); }
  }
  const edit = (p) => { setEditId(p.id); setF({ medicine: p.medicine, dosage: p.dosage, times: p.times.length ? p.times : [""], duration_days: p.duration_days, start_date: p.start_date, notes: p.notes }); window.scrollTo(0, 0); };
  const del = async (p) => { if (confirm(`Delete ${p.medicine}?`)) { await api(`/api/prescriptions/${p.id}`, { method: "DELETE" }); load(); refresh(); } };
  const setTime = (i, v) => setF({ ...f, times: f.times.map((x, j) => (j === i ? v : x)) });
  const saveCond = async (v) => { setCond(v); await api("/api/me", { method: "PUT", body: { condition: v } }); refresh(); };

  return (
    <>
      <h1>{editId ? "Edit medicine" : "Add medicine"}</h1>
      <div className="card">
        <h2>📄 Your prescription</h2>
        <p className="muted">Upload the doctor's prescription (photo or PDF). It is kept private here, and CareDose can read the medicines for you to check.</p>
        <form onSubmit={uploadDoc} className="row">
          <input className="grow" name="doc" type="file" accept="image/*,application/pdf" aria-label="Prescription photo or PDF" />
          <button disabled={dbusy === "upload"}>{dbusy === "upload" ? "Uploading…" : "Upload"}</button>
        </form>
        {dmsg && <div className={dmsg.k} role="status">{dmsg.t}</div>}
        {docs.map((d) => (
          <div className="rxdoc" key={d.id}>
            <span style={{ fontSize: "1.6rem" }}>{d.type === "application/pdf" ? "📕" : "🖼️"}</span>
            <div className="grow"><b>{d.name}</b><div className="muted">{new Date(d.uploaded_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</div></div>
            <button className="ghost" onClick={() => openFile(`/api/prescription-docs/${d.id}/file`).catch((x) => setDmsg({ k: "err", t: x.message }))}>View</button>
            <button onClick={() => readDoc(d)} disabled={!!dbusy}>{dbusy === `read${d.id}` ? "Reading…" : "Read medicines"}</button>
            <button className="danger" onClick={() => delDoc(d)}>Delete</button>
          </div>))}
        {drafts && drafts.length > 0 && <>
          <div className="warn" style={{ marginTop: ".8rem" }}>⚠ Read automatically, so it can make mistakes. Check each medicine against your paper prescription before saving.</div>
          {drafts.map((m, i) => (
            <div className="draft row" key={i}>
              <div className="grow"><b>{m.medicine}</b> <span className="muted">· {m.dosage || "dosage not found"}</span>
                <div className="muted">{m.times.length ? m.times.join(", ") : "times not found"} · {m.duration_days ? `${m.duration_days} days` : "days not found"}{m.notes && ` · ${m.notes}`}</div></div>
              <button onClick={() => useDraft(m)}>Use this</button>
            </div>))}
        </>}
      </div>

      <form className="card" onSubmit={save}>
        <label htmlFor="m">Medicine name</label><input id="m" value={f.medicine} onChange={(e) => setF({ ...f, medicine: e.target.value })} required />
        <label htmlFor="d">Dosage</label><input id="d" placeholder="500 mg, 1 tablet" value={f.dosage} onChange={(e) => setF({ ...f, dosage: e.target.value })} />
        <label>Times each day</label>
        <div className="times">
          {f.times.map((tm, i) => <span key={i} className="row">
            <input type="time" aria-label={`Time ${i + 1}`} value={tm} onChange={(e) => setTime(i, e.target.value)} />
            {f.times.length > 1 && <button type="button" className="ghost" aria-label="Remove time" onClick={() => setF({ ...f, times: f.times.filter((_, j) => j !== i) })}>✕</button>}
          </span>)}
          <button type="button" className="ghost" onClick={() => setF({ ...f, times: [...f.times, ""] })}>Add time</button>
        </div>
        <div className="grid">
          <div><label htmlFor="du">Number of days</label><input id="du" type="number" min="1" value={f.duration_days} onChange={(e) => setF({ ...f, duration_days: e.target.value })} /></div>
          <div><label htmlFor="s">Start date</label><input id="s" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
        </div>
        <label htmlFor="no">Notes (for example, after food)</label><input id="no" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <label htmlFor="ph">Tablet photo (used for reminders and camera check)</label><input id="ph" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} />
        {msg && <div className={msg.k} role="status">{msg.t}</div>}
        <p style={{ marginTop: "1rem" }} className="row"><button className="big">Save medicine</button>{editId && <button type="button" className="ghost big" onClick={() => { setEditId(null); setF(blank); }}>Cancel</button>}</p>
      </form>

      <div className="card"><label htmlFor="c" style={{ marginTop: 0 }}>Health condition (for diet tips)</label>
        <select id="c" value={cond} onChange={(e) => saveCond(e.target.value)}>{conditions.map((c) => <option key={c}>{c}</option>)}</select></div>

      <h2>Your medicines</h2>
      {list.length === 0 && <div className="card muted">No medicines yet.</div>}
      {list.map((p) => (
        <div className="card row" key={p.id}>
          <PillImg url={p.image_url} />
          <div className="grow">
            <h3>{p.medicine || "Unnamed"} {p.status === "incomplete" && <span className="chip missed">Needs review</span>}</h3>
            <div className="muted">{p.dosage || "No dosage"} · {p.times.join(", ") || "No times"} · {p.duration_days} days</div>
            {p.missing.length > 0 && <div className="warn">Missing: {p.missing.join(", ")}</div>}
          </div>
          <button className="ghost" onClick={() => edit(p)}>Edit</button><button className="danger" onClick={() => del(p)}>Delete</button>
        </div>
      ))}
    </>
  );
}
