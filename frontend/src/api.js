// Thin fetch wrapper. Token lives in localStorage; errors become readable messages.
export const getToken = () => localStorage.getItem("cd_token");
export const setToken = (t) => (t ? localStorage.setItem("cd_token", t) : localStorage.removeItem("cd_token"));

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const d = data.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : "Something went wrong");
  }
  return data;
}

export const q = (patientId) => (patientId ? `patient_id=${patientId}` : "");
export const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Private files (prescriptions) need the login token, so fetch them and open the result in a new tab.
export async function openFile(path) {
  const w = window.open("", "_blank");
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error("Could not open the file");
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location = url; else window.location = url;
  } catch (e) { if (w) w.close(); throw e; }
}