const {
  SESSION_COOKIE_NAME,
  authenticateCredentials,
  createLoginSession,
  registerUser,
  revokeSession,
} = require('../services/auth.service');
const { getSessionToken } = require('../middleware/auth.middleware');

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const isValidEmail = (email) =>
  typeof email === 'string' &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const setSessionCookie = (res, token) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
};

const clearSessionCookie = (res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
  );
};

const register = async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address',
    });
  }

  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: 'Password must be between 12 and 128 characters',
    });
  }

  try {
    const session = await registerUser(normalizedEmail, password);
    setSessionCookie(res, session.token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user: session.user },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    console.error('Account registration failed:', error.code || 'unknown error');
    return res.status(500).json({
      success: false,
      message: 'Unable to create account',
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!isValidEmail(normalizedEmail) || typeof password !== 'string' || !password.length || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required',
    });
  }

  try {
    const user = await authenticateCredentials(normalizedEmail, password);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const session = await createLoginSession(user);
    setSessionCookie(res, session.token);

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      data: { user: session.user },
    });
  } catch (error) {
    console.error('Account sign-in failed:', error.code || 'unknown error');
    return res.status(500).json({
      success: false,
      message: 'Unable to sign in',
    });
  }
};

const currentUser = (req, res) =>
  res.status(200).json({ success: true, data: { user: req.user } });

const logout = async (req, res) => {
  const token = getSessionToken(req);

  try {
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    return res.status(200).json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Account sign-out failed:', error.code || 'unknown error');
    clearSessionCookie(res);
    return res.status(500).json({
      success: false,
      message: 'Unable to end session',
    });
  }
};

module.exports = { currentUser, login, logout, register };
