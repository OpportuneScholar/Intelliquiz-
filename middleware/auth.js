const jwt = require('jsonwebtoken');
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.');
  return 'dev_only_insecure_secret_change_me';
}
function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
}
function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  try { req.user = jwt.verify(token, getSecret()); return next(); }
  catch (err) { return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' }); }
}
function requireRole(role) {
  return (req, res, next) => {
    const actualRole = String(req.user?.role || '').trim().toLowerCase();
    const requiredRole = String(role || '').trim().toLowerCase();
    if (actualRole && actualRole === requiredRole) return next();

    // Keep the denial secure for clients while recording enough server-side
    // context to diagnose role/session mismatches without logging credentials.
    console.warn('[auth] Role denied', {
      path: req.originalUrl,
      requiredRole,
      actualRole: actualRole || 'missing',
      userId: req.user?.id || null
    });
    return res.status(403).json({
      success: false,
      code: 'ROLE_FORBIDDEN',
      message: 'This account does not have permission to access this resource. Please sign in with the correct account.'
    });
  };
}
module.exports = { signToken, verifyToken, requireRole };
