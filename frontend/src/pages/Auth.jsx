import { useState } from "react";
import { api, setToken } from "../api";
import { useApp } from "../ctx";
import { LANGS } from "../i18n";
import { Icon } from "../components.jsx";

// ✏️ EDIT THIS: your details appear in the "Developer" section of the home page.
// Leave email / github / linkedin as "" to hide that link.
const DEVELOPER = {
  name: "Healorithm Team",
  role: "CareDose Developer",
  about: "We built CareDose so that nobody has to wonder whether they took their medicine. It combines simple reminders, a camera check, and family support in one easy app.",
  email: "adluriraviteja182@gmail.com",
  github: "https://github.com/Healorithm",
  linkedin: "https://www.linkedin.com/company/healorithm",
};

const FEATURES = [
  { icon: "bell", tone: "teal", title: "Smart reminders", text: "Alerts at the right time with a voice prompt and a photo of the exact tablet, so there is no confusion." },
  { icon: "camera", tone: "coral", title: "Camera tablet check", text: "At medicine time the camera opens and checks your tablet against the photo you saved before it marks the dose as taken." },
  { icon: "globe", tone: "blue", title: "Speaks your language", text: "English, Hindi and Telugu, with spoken reminders and voice questions for people who find typing hard." },
  { icon: "users", tone: "purple", title: "Family peace of mind", text: "A caregiver is told if a dose is missed, but only after the patient says yes. Access can be removed at any time." },
  { icon: "chat", tone: "teal", title: "Safe assistant", text: "Ask \"when is my next dose?\" and get a clear answer. It never gives medical advice and sends those questions to your doctor." },
  { icon: "trophy", tone: "amber", title: "Rewards that motivate", text: "Points, streaks, levels and badges make taking medicine on time feel like a win, even a family one." },
  { icon: "shield", tone: "green", title: "Pharmacist safety checks", text: "Overlapping times or missing details are flagged for a pharmacist to review before they become a problem." },
  { icon: "chart", tone: "blue", title: "Clear progress reports", text: "Daily, weekly and monthly adherence, so patients and doctors can see what is really happening." },
];

const WHO = [
  { icon: "heart", title: "Patients", text: "Older adults and anyone on regular medicines. Large text, simple screens, spoken reminders." },
  { icon: "users", title: "Caregivers", text: "Children, spouses and helpers who want to know their loved one is safe without calling every day." },
  { icon: "shield", title: "Pharmacists", text: "Review flagged prescriptions in one queue and confirm them with the patient." },
];

const STEPS = [
  { t: "Create your account", d: "Choose Patient, Caregiver or Pharmacist, and pick your language." },
  { t: "Add your medicines", d: "Enter the name, dosage, times and how many days. Take a photo of the tablet." },
  { t: "Allow the camera", d: "Tap \"Turn on camera & alerts\" once so it can open by itself at medicine time." },
  { t: "Take it, show it", d: "When the reminder comes, hold the tablet to the camera. Done, and your streak grows." },
];

export default function Auth() {
  const { setUser, t } = useApp();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "", role: "patient", language: "en" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr("");
    try {
      const r = await api(`/api/auth/${mode}`, { method: "POST", body: mode === "login" ? { email: f.email, password: f.password } : f });
      setToken(r.token); setUser(r.user);
    } catch (x) { setErr(x.message); }
  }
  const initials = DEVELOPER.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="land">
      <header className="land-top">
        <span className="brand"><span className="logo"><Icon name="pill" size={22} /></span><span>CareDose</span></span>
        <nav className="land-links" aria-label="Page sections">
          <a href="#about">About</a><a href="#helps">How it helps</a><a href="#use">How to use</a><a href="#developer">Developer</a>
        </nav>
      </header>

      {/* ---------- hero + sign in ---------- */}
      <section className="land-hero">
        <div className="land-copy rise">
          <span className="pillbadge"><Icon name="heart" size={16} /> Built for people who take medicine every day</span>
          <h1>Never miss a dose <em>again.</em></h1>
          <p className="lead">CareDose reminds you, shows you the exact tablet, checks it with your camera, and lets your family know you are safe.</p>
          <div className="chips">
            <span className="chip-i"><Icon name="bell" size={18} /> Voice reminders</span>
            <span className="chip-i"><Icon name="camera" size={18} /> Camera check</span>
            <span className="chip-i"><Icon name="globe" size={18} /> 3 languages</span>
            <span className="chip-i"><Icon name="shield" size={18} /> Family alerts with consent</span>
          </div>
          <div className="floaters" aria-hidden>
            <span className="fl f1">💊</span><span className="fl f2">⏰</span><span className="fl f3">❤️</span>
          </div>
        </div>

        <div className="card auth-card rise" id="signin" style={{ animationDelay: "80ms" }}>
          <h2>{mode === "login" ? t("login") : t("register")}</h2>
          <form onSubmit={submit}>
            {mode === "register" && <>
              <label htmlFor="n">Name</label><input id="n" value={f.name} onChange={set("name")} required />
              <label htmlFor="r">I am a</label>
              <select id="r" value={f.role} onChange={set("role")}>
                <option value="patient">Patient</option><option value="caregiver">Caregiver</option><option value="clinician">Pharmacist / clinician</option>
              </select>
              <label htmlFor="l">Language</label>
              <select id="l" value={f.language} onChange={set("language")}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </>}
            <label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set("email")} required />
            <label htmlFor="p">Password</label><input id="p" type="password" value={f.password} onChange={set("password")} required minLength={6} />
            {err && <div className="err" role="alert">{err}</div>}
            <p style={{ marginTop: "1.1rem" }}><button className="big" style={{ width: "100%" }}>{mode === "login" ? t("login") : t("register")}</button></p>
          </form>
          <button className="ghost" style={{ width: "100%" }} onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? t("register") : t("login")}
          </button>
          <p className="muted" style={{ marginTop: "1rem", fontSize: ".9rem" }}>Demo: patient@demo.com, caregiver@demo.com or clinician@demo.com. Password demo123.</p>
        </div>
      </section>

      {/* ---------- about ---------- */}
      <section className="land-sec" id="about">
        <div className="sec-head"><span className="eyebrow">About the app</span><h2>Taking medicine on time should not be hard</h2></div>
        <div className="about">
          <p>Missing doses is one of the most common reasons treatment fails, especially for older people who take several medicines. Tablets look alike, schedules are easy to forget, and families worry from far away.</p>
          <p>CareDose brings the solution together in one calm, easy screen. It reminds the patient, <b>shows the exact tablet</b>, verifies it with the camera, and keeps a record that doctors and family can trust.</p>
          <div className="stats3">
            <div><b>1</b><span>screen to follow your day</span></div>
            <div><b>3</b><span>languages with voice</span></div>
            <div><b>0</b><span>medical advice from the chatbot</span></div>
          </div>
        </div>
      </section>

      {/* ---------- how it helps ---------- */}
      <section className="land-sec" id="helps">
        <div className="sec-head"><span className="eyebrow">How it helps</span><h2>Everything around one dose, covered</h2></div>
        <div className="feat-grid">
          {FEATURES.map((x, i) => (
            <article className="feat rise" key={x.title} style={{ animationDelay: `${i * 50}ms` }}>
              <span className={`ico ${x.tone}`}><Icon name={x.icon} size={26} /></span>
              <h3>{x.title}</h3><p>{x.text}</p>
            </article>))}
        </div>
      </section>

      {/* ---------- who ---------- */}
      <section className="land-sec">
        <div className="sec-head"><span className="eyebrow">Who it is for</span><h2>One app, three roles</h2></div>
        <div className="who">
          {WHO.map((w) => <div className="who-card" key={w.title}><span className="ico teal"><Icon name={w.icon} size={26} /></span><h3>{w.title}</h3><p>{w.text}</p></div>)}
        </div>
      </section>

      {/* ---------- how to use ---------- */}
      <section className="land-sec" id="use">
        <div className="sec-head"><span className="eyebrow">How to use</span><h2>Ready in four steps</h2></div>
        <ol className="steps">
          {STEPS.map((s) => <li key={s.t}><h3>{s.t}</h3><p>{s.d}</p></li>)}
        </ol>
        <p style={{ textAlign: "center", marginTop: "1.2rem" }}><a className="btn-link" href="#signin">Get started <Icon name="check" size={18} /></a></p>
      </section>

      {/* ---------- developer ---------- */}
      <section className="land-sec" id="developer">
        <div className="sec-head"><span className="eyebrow">Developer</span><h2>Who built this</h2></div>
        <div className="dev card">
          <span className="avatar" aria-hidden>{initials}</span>
          <div className="grow">
            <h3 style={{ marginBottom: 0 }}>{DEVELOPER.name}</h3>
            <div className="muted" style={{ marginBottom: ".5rem" }}><Icon name="code" size={16} /> {DEVELOPER.role}</div>
            <p>{DEVELOPER.about}</p>
            <div className="row">
              {DEVELOPER.email && <a className="dev-link" href={`mailto:${DEVELOPER.email}`}><Icon name="mail" size={18} /> Email</a>}
              {DEVELOPER.github && <a className="dev-link" href={DEVELOPER.github} target="_blank" rel="noreferrer"><Icon name="code" size={18} /> GitHub</a>}
              {DEVELOPER.linkedin && <a className="dev-link" href={DEVELOPER.linkedin} target="_blank" rel="noreferrer"><Icon name="link" size={18} /> LinkedIn</a>}
            </div>
          </div>
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: "1.2rem", fontSize: ".9rem" }}>
          CareDose is a reminder tool. It does not give medical advice. Always follow your doctor's instructions.
        </p>
      </section>

      <footer className="land-foot">Made with <Icon name="heart" size={14} /> · CareDose © {new Date().getFullYear()}</footer>
    </div>
  );
}