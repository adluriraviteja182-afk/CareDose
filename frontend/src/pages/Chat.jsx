import { useEffect, useRef, useState } from "react";
import { api, q } from "../api";
import { useApp } from "../ctx";
import { SPEECH, speak } from "../i18n";

export default function Chat() {
  const { t, lang, patientId, user } = useApp();
  const [msgs, setMsgs] = useState([{ who: "bot", text: "Hello. Ask me about your medicine schedule." }]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [listening, setListening] = useState(false);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]); // braces: an effect must not return a value

  async function send(message) {
    if (!message.trim()) return;
    const history = msgs.slice(1).slice(-6).map((m) => ({ role: m.who === "me" ? "user" : "model", text: m.text }));
    setMsgs((m) => [...m, { who: "me", text: message }]); setText(""); setBusy(true);
    try {
      const r = await api(`/api/chat?${q(patientId)}`, { method: "POST", body: { message, language: lang, history } });
      setMsgs((m) => [...m, { who: "bot", text: r.reply, source: r.source, error: r.error }]); speak(r.reply, lang);
    } catch (e) { setMsgs((m) => [...m, { who: "bot", text: e.message }]); }
    setBusy(false);
  }

  // Voice input: browser speech recognition when available, otherwise record audio and send it to Whisper on the server.
  async function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR(); r.lang = SPEECH[lang]; setListening(true);
      r.onresult = (e) => send(e.results[0][0].transcript);
      r.onend = () => setListening(false); r.onerror = () => setListening(false); r.start(); return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }); const rec = new MediaRecorder(s); const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data); setListening(true);
      rec.onstop = async () => {
        s.getTracks().forEach((x) => x.stop()); setListening(false);
        const form = new FormData(); form.append("file", new Blob(chunks, { type: "audio/webm" }), "a.webm"); form.append("language", lang);
        try { const r = await api("/api/stt", { method: "POST", form }); send(r.text); } catch (e) { setMsgs((m) => [...m, { who: "bot", text: e.message }]); }
      };
      rec.start(); setTimeout(() => rec.stop(), 5000);
    } catch { setMsgs((m) => [...m, { who: "bot", text: "Microphone is not available." }]); }
  }

  return (
    <>
      <h1>{t("chat")}</h1>
      <div className="chat" aria-live="polite">{msgs.map((m, i) => <div key={i} className={`msg ${m.who}`}>{m.text}
        {m.source === "gemini" && <div className="muted" style={{ fontSize: ".75rem", marginTop: ".3rem" }}>✨ Gemini</div>}
        {m.error && <div className="warn" style={{ fontSize: ".8rem", marginTop: ".4rem" }}>Gemini is not working: {m.error}. Showing a basic offline answer.</div>}</div>)}<div ref={end} /></div>
      <div className="card">
        <p className="muted" style={{ fontSize: ".9rem" }}>I explain your schedule only. For medical advice, ask your doctor or pharmacist.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="grow" aria-label={t("askHint")} placeholder={t("askHint")} value={text} onChange={(e) => setText(e.target.value)} />
          <button disabled={busy}>{t("send")}</button>
          <button type="button" className="ghost" onClick={listen} disabled={listening}>{listening ? "…" : `🎤 ${t("speak")}`}</button>
        </form>
      </div>
    </>
  );
}
