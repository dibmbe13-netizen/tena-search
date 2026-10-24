# tena-search
>A hospital service directory for Ethiopia that helps you find nearby healthcare facilities with the service you need, right now!
> **Status:** 🚧 In development. Core search and dashboards are being built.
## Why
  When someone needs urgent care, calling around or driving to a facility that
  turns out to lack the right service wastes critical time. Patients have no
  reliable way to see what a hospital offers at that moment.

  Tena Search closes that gap. Hospitals keep their service availability up to
  date, patients search by the care they need, and the platform also suggests
  nearby alternatives.
## Features

- Search hospitals by service (MRI, CT scan, radiography, dialysis, and more) and city
- **Emergency page**: open emergency hospitals with a large "Call ambulance" button and Google Maps directions
- **Freshness badge on every listing**: green (under 6 h), amber (6 to 12 h), red (over 12 h, "may be outdated")
- **Ranking**: hospitals are scored 3 x freshness + 2 x closeness, so the most recently updated and nearest hospitals come first  (weights are in lib/rank.js)
- **Optional visitor location**, used only to sort results and never saved
- Hospital registration with admin approval
- **Hospital dashboard**: data specialists update services, emergency status, phone numbers and location (at least twice a day)
- Every account can change its password (this also logs it out of other devices)
- **Admin panel**: approve or reject any hospital at any time, with live statistics (hospitals, users, emergency-open, data freshness)
## Tech Stack

- **Frontend:** HTML, CSS, Bootstrap5
- **Backend:** Node.js, Express.js, express-session, bcryptjs, express-rate-limit
- **Database:** SQLite (better-sqlite3)
## Deployment
-**Database**: Turso (hosted SQLite, free plan), so data survives restarts
-**Server**: Render web service (free plan). Build npm install, start npm start, health check /healthz
## Project Structure

server.js          app setup and public API routes
db.js              tables, demo data, login accounts
seed-data.js       the demo hospitals (edit this to change them)
lib/               ranking, session storage, shared helpers
routes/            auth, dashboard, admin
public/            the website (HTML, css/, js/)

## Security

Passwords are hashed with bcrypt, secrets live in environment variables (never in the code). Sessions are stored in the database. Login and registration are rate limited. Every query uses placeholders (no SQL injection), and all user-typed text is escaped before it is displayed. A hospital can only edit its own record, and the admin can lock a hospital out at any time.

## Limitations and next steps
Distance is a straight line, not a driving route
Data is entered by hospitals, so accuracy depends on them updating on time
Next: reminders for hospitals that miss an update, an Amharic version, and a hosted database for long-term storage

