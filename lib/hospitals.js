const db = require("../db");

// Turn a database row into the shape the frontend expects
const shape = (h, services) => ({ ...h, emergency_open: h.emergency_open === 1, services });

// one hospital + its services (2 database calls)
async function withServices(h) {
  const rows = await db.all(`
    SELECT s.name FROM hospital_services hs
    JOIN services s ON s.id = hs.service_id
    WHERE hs.hospital_id = ? AND hs.available = 1`, [h.id]);
  return shape(h, rows.map((r) => r.name));
}

// all public hospitals (2 database calls in total, however many hospitals there are)
async function approved() {
  const [hospitals, links] = await Promise.all([
    db.all("SELECT * FROM hospitals WHERE status = 'approved' AND last_updated IS NOT NULL"),
    db.all(`SELECT hs.hospital_id, s.name FROM hospital_services hs
            JOIN services s ON s.id = hs.service_id WHERE hs.available = 1`),
  ]);
  const byHospital = new Map();
  links.forEach((l) => {
    if (!byHospital.has(l.hospital_id)) byHospital.set(l.hospital_id, []);
    byHospital.get(l.hospital_id).push(l.name);
  });
  return hospitals.map((h) => shape(h, byHospital.get(h.id) || []));
}

module.exports = { withServices, approved };