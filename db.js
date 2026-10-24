const { createClient } = require("@libsql/client");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { SERVICES, HOSPITALS } = require("./seed-data");

// If TURSO_DATABASE_URL is set we use the online database (Turso).
// Otherwise we use a file on this computer, so everything still works offline.
const url = process.env.TURSO_DATABASE_URL || "file:data/hospital.db";
if (url.startsWith("file:")) fs.mkdirSync("data", { recursive: true });
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// ---- small helpers the rest of the app uses. All of them need `await`. ----
const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const all = async (sql, args = []) => toObjects(await client.execute({ sql, args })); // many rows
const get = async (sql, args = []) => (await all(sql, args))[0];                      // one row (or undefined)
const count = async (sql, args = []) => (await get(sql, args)).n;                     // SELECT COUNT(*) AS n ...
const run = async (sql, args = []) => {                                               // INSERT / UPDATE / DELETE
  const rs = await client.execute({ sql, args });
  return { changes: rs.rowsAffected, id: Number(rs.lastInsertRowid || 0) };
};
const batch = (statements) => client.batch(statements, "write"); // [{ sql, args }, ...] all succeed or none do

const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();

// Creates tables and demo data on first start. server.js waits for this before accepting visitors.
async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      phone TEXT,
      ambulance_phone TEXT,
      emergency_open INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      last_updated TEXT,
      lat REAL,
      lng REAL
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hospital_services (
      hospital_id INTEGER,
      service_id INTEGER,
      available INTEGER DEFAULT 0,
      PRIMARY KEY (hospital_id, service_id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      hospital_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);

  // Upgrade an older database: add the location columns if they are missing
  const cols = (await all("PRAGMA table_info(hospitals)")).map((c) => c.name);
  if (!cols.includes("lat")) {
    await client.executeMultiple("ALTER TABLE hospitals ADD COLUMN lat REAL; ALTER TABLE hospitals ADD COLUMN lng REAL;");
  }

  // Fill from seed-data.js, only when empty
  if ((await count("SELECT COUNT(*) AS n FROM hospitals")) === 0) {
    await batch(SERVICES.map((name) => ({ sql: "INSERT INTO services (name) VALUES (?)", args: [name] })));
    for (const h of HOSPITALS) {
      const { id } = await run(
        `INSERT INTO hospitals (name, address, city, phone, ambulance_phone, emergency_open, status, last_updated, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
        [h.name, h.address, h.city, h.phone, h.ambulance_phone, h.emergency_open ? 1 : 0,
         hoursAgo(h.updated_hours_ago), h.lat ?? null, h.lng ?? null]
      );
      await batch(h.services.map((s) => ({
        sql: "INSERT INTO hospital_services (hospital_id, service_id, available) SELECT ?, id, 1 FROM services WHERE name = ?",
        args: [id, s],
      })));
    }
  }

  // Copy coordinates from seed-data.js into hospitals that don't have any yet
  for (const h of HOSPITALS) {
    if (h.lat != null && h.lng != null) {
      await run("UPDATE hospitals SET lat = ?, lng = ? WHERE name = ? AND lat IS NULL", [h.lat, h.lng, h.name]);
    }
  }

  // Login accounts: one admin, and one staff account per hospital
  if ((await count("SELECT COUNT(*) AS n FROM users")) === 0) {
    const isProd = process.env.NODE_ENV === "production";
    const adminPw = process.env.ADMIN_PASSWORD || (isProd ? null : "admin12345");
    const staffPw = process.env.STAFF_PASSWORD || (isProd ? null : "staff12345");
    const insert = "INSERT INTO users (email, password_hash, role, hospital_id) VALUES (?, ?, ?, ?)";

    if (adminPw) await run(insert, ["admin@hospitalfinder.demo", bcrypt.hashSync(adminPw, 10), "admin", null]);
    if (staffPw) {
      for (const h of await all("SELECT id FROM hospitals")) {
        await run(insert, [`hospital${h.id}@hospitalfinder.demo`, bcrypt.hashSync(staffPw, 10), "hospital", h.id]);
      }
    }
    if (!adminPw || !staffPw) console.warn("Set ADMIN_PASSWORD and STAFF_PASSWORD to create login accounts.");
  }
  console.log(`Database ready (${url.startsWith("file:") ? "local file" : "online"})`);
}

module.exports = { all, get, count, run, batch, init };