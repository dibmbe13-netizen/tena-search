// Use on any route that needs a logged-in user with a specific role.
function requireRole(role) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Please log in" });
    if (user.role !== role) return res.status(403).json({ error: "Not allowed" });
    next();
  };
}

module.exports = { requireRole };