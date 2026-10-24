const express = require("express");
const db = require("../db");
const wrap = require("../lib/async");
const { requireRole } = require("../middleware");
const { withServices } = require("../lib/hospitals");
const { readLocation } = require("../lib/rank");

const router = express.Router();
router.use(requireRole("hospital")); // everything below needs a hospital login

// ...and the admin must still have this hospital approved (the admin can reject at any time)
router.use(wrap(async (req, res, next) => {
  const h = await db.get("SELECT status FROM hospitals WHERE id = ?", [req.session.user.hospital_id]);
  if (!h || h.status !== "approved") {
    return res.status(403).json({ error: "Your hospital is not approved at the moment." });
  }
  next();
}));

const PHONE = /^[0-9+()\- ]{3,20}$/;
const getHospital = (id) => db.get("SELECT * FROM hospitals WHERE id = ?", [id]);

// GET /api/dashboard -> my hospital
router.get("/", wrap(async (req, res) => {
  res.json(await withServices(await getHospital(req.session.user.hospital_id)));
}));

// PUT /api/dashboard -> save my update
router.put("/", wrap(async (req, res) => {
  const id = req.session.user.hospital_id; // from the login, never from the request
  const { emergency_open, phone, ambulance_phone, services } = req.body || {};

  const p = String(phone || "").trim();
  const a = String(ambulance_phone || "").trim();
  if (!PHONE.test(p)) return res.status(400).json({ error: "Enter a valid phone number" });
  if (a && !PHONE.test(a)) return res.status(400).json({ error: "Enter a valid ambulance number" });
  if (!Array.isArray(services)) return res.status(400).json({ error: "Services must be a list" });

  const loc = readLocation(req.body);
  if (!loc) return res.status(400).json({ error: "Enter your hospital's latitude and longitude" });

  // The emergency switch decides the "Emergency" service, so they never disagree
  const wanted = new Set(services.filter((s) => s !== "Emergency"));
  if (emergency_open === true) wanted.add("Emergency");
  const chosen = (await db.all("SELECT id, name FROM services")).filter((s) => wanted.has(s.name));

  // all changes happen together or not at all
  await db.batch([
    {
      sql: `UPDATE hospitals SET phone = ?, ambulance_phone = ?, emergency_open = ?, last_updated = ?, lat = ?, lng = ?
            WHERE id = ?`,
      args: [p, a || null, emergency_open === true ? 1 : 0, new Date().toISOString(), loc.lat, loc.lng, id],
    },
    { sql: "DELETE FROM hospital_services WHERE hospital_id = ?", args: [id] },
    ...chosen.map((s) => ({
      sql: "INSERT INTO hospital_services (hospital_id, service_id, available) VALUES (?, ?, 1)",
      args: [id, s.id],
    })),
  ]);

  res.json(await withServices(await getHospital(id)));
}));

module.exports = router;