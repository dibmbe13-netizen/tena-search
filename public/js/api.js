const ALL_SERVICES = ["Emergency", "MRI", "CT Scan", "Radiography", "Ultrasound", "Lab", "Cardiology", "Dialysis", "Oncology", "Maternity", "Pediatrics", "Surgery", "Neurosurgery", "Dental", "Eye care", "Psychiatry"];

async function getJSON(url) {
  try {
    const res = await fetch(url);
    return res.ok ? res.json() : null;
  } catch (e) {
    return null; // network problem
  }
}

const api = {
  async hospitals({ service, city, open } = {}) {
    const p = new URLSearchParams();
    if (service) p.set("service", service);
    if (city) p.set("city", city);
    if (open) p.set("open", "1");
    const loc = savedLocation();
    if (loc) { p.set("lat", loc.lat); p.set("lng", loc.lng); }
    return getJSON("/api/hospitals?" + p); // null if it could not load
  },
  async emergency() {
    const loc = savedLocation();
    return getJSON("/api/emergency" + (loc ? `?lat=${loc.lat}&lng=${loc.lng}` : ""));
  },
  async hospital(id) { return getJSON("/api/hospitals/" + id); },

  // for logged-in hospital staff
  async dashboard() { return getJSON("/api/dashboard"); },
  async saveDashboard(data) {
    const res = await fetch("/api/dashboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  },
};