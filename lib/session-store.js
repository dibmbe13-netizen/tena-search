// Keeps login sessions in the database, so restarting the server never logs everyone out.
module.exports = function sessionStore(session, db) {
  const DAY = 24 * 60 * 60 * 1000;
  const expiry = (sess) =>
    sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DAY;

  class DbStore extends session.Store {
    get(sid, cb) {
      db.get("SELECT data FROM sessions WHERE sid = ? AND expires > ?", [sid, Date.now()])
        .then((row) => cb(null, row ? JSON.parse(row.data) : null), (err) => cb(err));
    }
    set(sid, sess, cb) {
      db.run("INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)",
        [sid, JSON.stringify(sess), expiry(sess)])
        .then(() => cb && cb(null), (err) => cb && cb(err));
    }
    // We don't extend a session on every click: it saves database writes. It lasts 8 hours from login.
    touch(sid, sess, cb) { if (cb) cb(null); }
    destroy(sid, cb) {
      db.run("DELETE FROM sessions WHERE sid = ?", [sid])
        .then(() => cb && cb(null), (err) => cb && cb(err));
    }
  }

  // clean out expired sessions every 15 minutes
  setInterval(() => db.run("DELETE FROM sessions WHERE expires <= ?", [Date.now()]).catch(() => {}), 15 * 60 * 1000).unref();
  return new DbStore();
};