const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
  currentUser,
  login,
  logout,
  register,
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Try again later.',
    }),
});

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);

module.exports = router;
