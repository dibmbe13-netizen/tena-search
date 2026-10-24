// Lets a route use await safely: if something fails, the error goes to the error handler in server.js.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);