const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const wrap = require("../lib/async");
const { readLocation } = require("../lib/rank");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\- ]{3,20}$/;

// slow down guessing and spam: too many tries from one address and they must wait
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});
const changeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many registrations from this address. Try again later." },
});

// POST /api/auth/register  -> a hospital asks to join (starts as "pending")
router.post("/register", registerLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const city = String(b.city || "").trim();
  const address = String(b.address || "").trim();
  const phone = String(b.phone || "").trim();
  const ambulance = String(b.ambulance_phone || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const loc = readLocation(b);

  if (name.length < 3 || name.length > 100) return res.status(400).json({ error: "Enter the hospital name (3 to 100 characters)" });
  if (!city || city.length > 60) return res.status(400).json({ error: "Enter the city" });
  if (!address || address.length > 150) return res.status(400).json({ error: "Enter the address" });
  if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid phone number" });
  if (ambulance && !PHONE.test(ambulance)) return res.status(400).json({ error: "Enter a valid ambulance number" });
  if (!loc) return res.status(400).json({ error: "Enter the hospital's latitude and longitude" });
  if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Password must be 8 to 72 characters" });
  if (await db.get("SELECT 1 AS x FROM users WHERE email = ?", [email])) {
    return res.status(409).json({ error: "That email is already registered" });
  }

  try {
    // one all-or-nothing batch: last_insert_rowid() is the hospital we just inserted
    await db.batch([
      {
        sql: `INSERT INTO hospitals (name, address, city, phone, ambulance_phone, emergency_open, status, last_updated, lat, lng)
              VALUES (?, ?, ?, ?, ?, 0, 'pending', NULL, ?, ?)`,
        args: [name, address, city, phone, ambulance || null, loc.lat, loc.lng],
      },
      {
        sql: "INSERT INTO users (email, password_hash, role, hospital_id) VALUES (?, ?, 'hospital', last_insert_rowid())",
        args: [email, bcrypt.hashSync(password, 10)],
      },
    ]);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "That email is already registered" });
    throw err;
  }
  res.status(201).json({ ok: true });
}));

// POST /api/auth/login  { email, password }
router.post("/login", loginLimiter, wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");
  if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email" });

  const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }

  // hospital staff can only log in once the admin approved the hospital
  if (user.role === "hospital") {
    const h = await db.get("SELECT status FROM hospitals WHERE id = ?", [user.hospital_id]);
    if (h.status === "pending") return res.status(403).json({ error: "Your registration is waiting for admin approval." });
    if (h.status === "rejected") return res.status(403).json({ error: "Your registration was not approved." });
  }

  // new session id on every login, then remember who this is
  req.session.regenerate(() => {
    req.session.user = { id: user.id, role: user.role, hospital_id: user.hospital_id };
    res.json({ role: user.role });
  });
}));

// POST /api/auth/change-password  { current_password, new_password }  (any logged-in user)
router.post("/change-password", changeLimiter, wrap(async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please log in" });
  const current = String((req.body || {}).current_password || "");
  const next = String((req.body || {}).new_password || "");

  const user = await db.get("SELECT * FROM users WHERE id = ?", [req.session.user.id]);
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: "Your current password is wrong" });
  }
  if (next.length < 8 || next.length > 72) return res.status(400).json({ error: "New password must be 8 to 72 characters" });
  if (next === current) return res.status(400).json({ error: "Choose a password different from the current one" });

  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(next, 10), user.id]);
  // log this account out everywhere else (a stolen login stops working), but keep this device logged in
  await db.run("DELETE FROM sessions WHERE sid != ? AND json_extract(data, '$.user.id') = ?", [req.sessionID || "", user.id]);
  res.json({ ok: true });
}));

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me  -> who is logged in right now
router.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

module.exports = router;