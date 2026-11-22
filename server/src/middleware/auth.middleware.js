const {
  SESSION_COOKIE_NAME,
  getUserForSession,
} = require('../services/auth.service');

const getSessionToken = (request) => {
  const cookieHeader = request.headers.cookie || '';
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const token = cookie?.slice(prefix.length);

  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
};

const requireAuth = async (req, res, next) => {
  const token = getSessionToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  try {
    const user = await getUserForSession(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    req.user = user;
    req.sessionToken = token;
    return next();
  } catch (error) {
    console.error('Session validation failed:', error.code || 'unknown error');
    return res.status(500).json({
      success: false,
      message: 'Unable to validate session',
    });
  }
};

module.exports = { getSessionToken, requireAuth };
