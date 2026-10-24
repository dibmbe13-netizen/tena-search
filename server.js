const express = require("express");
const session = require("express-session");
const db = require("./db");
const wrap = require("./lib/async");
const { withServices, approved } = require("./lib/hospitals");
const { rank, readLocation } = require("./lib/rank");

const app = express();
const isProd = process.env.NODE_ENV === "production";
if (isProd) app.set("trust proxy", 1); // the host sits in front of us

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-secret",
  resave: false,
  store: require("./lib/session-store")(session, db), // sessions survive restarts
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static("public"));

app.get("/healthz", (req, res) => res.send("ok")); // lets the host check we are alive

app.use("/api/auth", require("./routes/auth"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/admin", require("./routes/admin"));

// ---------- public routes ----------
app.get("/api/hospitals", wrap(async (req, res) => {
  const { service, city, open } = req.query;
  let list = await approved();
  if (service) list = list.filter((h) => h.services.includes(service));
  if (city) list = list.filter((h) => h.city.toLowerCase().includes(city.toLowerCase()));
  if (open === "1") list = list.filter((h) => h.emergency_open);
  res.json(rank(list, readLocation(req.query))); // freshest and closest first
}));

app.get("/api/emergency", wrap(async (req, res) => {
  const list = (await approved()).filter((h) => h.emergency_open);
  res.json(rank(list, readLocation(req.query)));
}));

app.get("/api/hospitals/:id", wrap(async (req, res) => {
  const h = await db.get(
    "SELECT * FROM hospitals WHERE id = ? AND status = 'approved' AND last_updated IS NOT NULL", [req.params.id]);
  if (!h) return res.status(404).json({ error: "Not found" });
  res.json(await withServices(h));
}));

// unknown /api address -> JSON 404
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// anything that crashes ends up here, so visitors never see a stack trace
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? "Something went wrong" : "Bad request" });
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`)))
  .catch((err) => { console.error("Could not start:", err); process.exit(1); });

module.exports = app; // lets tests load the app without starting it