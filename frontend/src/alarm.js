// A real alarm: a repeating beep pattern made with Web Audio (no sound file needed) plus phone vibration.
// Browsers keep audio locked until the user touches the page once, so unlockAudio() runs on the first tap.
const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
let ctx = null, timer = null, stopTimer = null, ringing = false;

const getCtx = () => { if (!ctx && AC) ctx = new AC(); return ctx; };
export const unlockAudio = () => { const c = getCtx(); if (c && c.state === "suspended") c.resume().catch(() => {}); };
export const audioReady = () => !!ctx && ctx.state === "running";
export const isRinging = () => ringing;

function beep(c, freq, start, dur) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g); g.connect(c.destination);
  o.start(start); o.stop(start + dur + 0.02);
}

export function startAlarm(maxMs = 60000) {
  const c = getCtx();
  if (!c || ringing) return;
  ringing = true;
  const pattern = () => {
    if (c.state !== "running") return; // still locked: plays as soon as the user taps the page
    const t = c.currentTime;
    [880, 660, 880, 660].forEach((f, i) => beep(c, f, t + i * 0.25, 0.18));
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  };
  c.resume().then(pattern).catch(() => {});
  timer = setInterval(pattern, 1800);
  stopTimer = setTimeout(stopAlarm, maxMs); // never ring forever
}

export function stopAlarm() {
  ringing = false;
  clearInterval(timer); clearTimeout(stopTimer); timer = stopTimer = null;
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
}