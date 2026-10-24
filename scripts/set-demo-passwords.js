
// It changes the passwords of admin@hospitalfinder.demo and hospital1..N@hospitalfinder.demo only.
const bcrypt = require("bcryptjs");
const db = require("../db");

const adminPw = process.env.ADMIN_PASSWORD;
const staffPw = process.env.STAFF_PASSWORD;
if (!adminPw || !staffPw || adminPw.length < 10 || staffPw.length < 10) {
  console.error("Put ADMIN_PASSWORD and STAFF_PASSWORD (at least 10 characters each) in your .env file first.");
  process.exit(1);
}

(async () => {
  await db.init();
  const users = await db.all("SELECT id, role FROM users WHERE email LIKE '%@hospitalfinder.demo'");
  for (const u of users) {
    const hash = bcrypt.hashSync(u.role === "admin" ? adminPw : staffPw, 10);
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, u.id]);
  }
  console.log(`Updated ${users.length} demo accounts.`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });