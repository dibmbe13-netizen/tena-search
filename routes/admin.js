const express = require("express");
const db = require("../db");
const wrap = require("../lib/async");
const { requireRole } = require("../middleware");

const router = express.Router();
router.use(requireRole("admin")); // only the admin gets past this line

// GET /api/admin/stats -> the numbers for the top of the admin page
router.get("/stats", wrap(async (req, res) => {
  const cutoff = new Date(Date.now() - 12 * 36e5).toISOString(); // "fresh" = updated in the last 12h
  const live = "SELECT COUNT(*) AS n FROM hospitals WHERE status = 'approved'";
  const [total, approved, pending, rejected, staff, admins, emergency, fresh, stale, unpublished, services] =
    await Promise.all([
      db.count("SELECT COUNT(*) AS n FROM hospitals"),
      db.count("SELECT COUNT(*) AS n FROM hospitals WHERE status = 'approved'"),
      db.count("SELECT COUNT(*) AS n FROM hospitals WHERE status = 'pending'"),
      db.count("SELECT COUNT(*) AS n FROM hospitals WHERE status = 'rejected'"),
      db.count("SELECT COUNT(*) AS n FROM users WHERE role = 'hospital'"),
      db.count("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
      db.count(live + " AND last_updated IS NOT NULL AND emergency_open = 1"),
      db.count(live + " AND last_updated >= ?", [cutoff]),
      db.count(live + " AND last_updated < ?", [cutoff]),
      db.count(live + " AND last_updated IS NULL"),
      db.count(`SELECT COUNT(*) AS n FROM hospital_services hs
                JOIN hospitals h ON h.id = hs.hospital_id
                WHERE hs.available = 1 AND h.status = 'approved'`),
    ]);
  res.json({
    hospitals: { total, approved, pending, rejected },
    users: { hospital_staff: staff, admins },
    live: { emergency_open: emergency, fresh, stale, unpublished },
    services_listed: services,
  });
}));

// GET /api/admin/hospitals?status=all|pending|approved|rejected
router.get("/hospitals", wrap(async (req, res) => {
  const status = req.query.status;
  const filter = ["pending", "approved", "rejected"].includes(status);
  res.json(await db.all(`
    SELECT h.id, h.name, h.address, h.city, h.phone, h.ambulance_phone, h.status,
           h.emergency_open, h.last_updated, h.lat, h.lng, u.email,
           (SELECT COUNT(*) FROM hospital_services hs
             WHERE hs.hospital_id = h.id AND hs.available = 1) AS service_count
    FROM hospitals h
    LEFT JOIN users u ON u.hospital_id = h.id AND u.role = 'hospital'
    ${filter ? "WHERE h.status = ?" : ""}
    ORDER BY CASE h.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, h.name
  `, filter ? [status] : []));
}));

// PUT /api/admin/hospitals/:id/status  { status: "approved" | "rejected" } (works at any time)
router.put("/hospitals/:id/status", wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be approved or rejected" });
  }
  const result = await db.run("UPDATE hospitals SET status = ? WHERE id = ?", [status, req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Hospital not found" });
  res.json({ ok: true });
}));

module.exports = router;