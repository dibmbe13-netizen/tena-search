// Shared bits: navbar, footer, and the "updated X ago" badge.
const NAV = `
<nav class="navbar navbar-expand-md bg-white border-bottom sticky-top">
 <div class="container">
  <a class="navbar-brand fw-bold text-teal" href="index.html">Hospital Finder</a>
  <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#menu" aria-label="Menu"><span class="navbar-toggler-icon"></span></button>
  <div class="collapse navbar-collapse" id="menu">
   <ul class="navbar-nav ms-auto align-items-md-center gap-md-2">
    <li class="nav-item"><a class="nav-link" href="search.html">Find services</a></li>
    <li class="nav-item"><a class="btn btn-danger" href="emergency.html">Emergency</a></li>
    <li class="nav-item" id="authItem"><a class="nav-link" href="login.html">Hospital login</a></li>
   </ul>
  </div>
 </div>
</nav>`;
const FOOT = `
<footer class="border-top bg-white mt-5 py-4"><div class="container small text-muted">
 In a life-threatening situation, call your national emergency number first.
 Availability is entered by each hospital, so check the "updated" time.
</div></footer>`;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nav").innerHTML = NAV;
  document.getElementById("foot").innerHTML = FOOT;

  // if someone is logged in, swap "Hospital login" for Dashboard + Log out
  fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((u) => {
    if (!u) return;
    const home = u.role === "admin" ? "admin.html" : "dashboard.html";
    document.getElementById("authItem").innerHTML =
      `<a class="nav-link d-inline" href="${home}">${u.role === "admin" ? "Admin" : "Dashboard"}</a>
       <a class="nav-link d-inline ms-2" href="account.html">Password</a>
       <button id="logout" class="btn btn-sm btn-outline-secondary ms-2">Log out</button>`;
    document.getElementById("logout").onclick = async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      location = "index.html";
    };
  });
});

// Call at the top of a private page. Sends visitors to the login page if they don't belong.
async function requireRole(role) {
  const r = await fetch("/api/auth/me");
  const u = r.ok ? await r.json() : null;
  if (!u || u.role !== role) { location = "login.html"; return null; }
  return u;
}

function hoursSince(iso) { return (Date.now() - new Date(iso)) / 36e5; }
function timeAgo(iso) {
  const h = hoursSince(iso);
  return h < 1 ? Math.max(1, Math.round(h * 60)) + " min ago" : Math.round(h) + " h ago";
}
// green under 6h, amber 6-12h, red over 12h
function freshBadge(iso) {
  const h = hoursSince(iso);
  const c = h < 6 ? "green" : h < 12 ? "amber" : "red";
  return `<span class="fresh fresh-${c}">Updated ${timeAgo(iso)}${c === "red" ? " (may be outdated)" : ""}</span>`;
}

// Always wrap text typed by users in esc() before putting it inside HTML.
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- location (only ever asked when the person presses a button) ----------
function getPosition(decimals = 3) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot share location."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: +pos.coords.latitude.toFixed(decimals), lng: +pos.coords.longitude.toFixed(decimals) }),
      (err) => reject(new Error(err.code === 1 ? "Location permission was denied." : "Could not get your location.")),
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}
function savedLocation() {
  try { return JSON.parse(sessionStorage.getItem("loc")); } catch (e) { return null; }
}
// for visitors: ask once, remember for this browser tab only (rounded to about 100 m)
async function askLocation() {
  const loc = await getPosition(3);
  sessionStorage.setItem("loc", JSON.stringify(loc));
  return loc;
}

// Show / Hide button next to a password box
function wirePasswordToggle(inputId, buttonId) {
  const input = document.getElementById(inputId), btn = document.getElementById(buttonId);
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    btn.setAttribute("aria-pressed", String(show));
  });
}

// Call at the top of a page that any logged-in person may use
async function requireLogin() {
  const r = await fetch("/api/auth/me");
  if (!r.ok) { location = "login.html"; return null; }
  return r.json();
}