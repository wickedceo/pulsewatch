const crypto = require('node:crypto');
const { promisify } = require('node:util');
const pool = require('../config/database');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE_NAME = 'pulsewatch_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, SCRYPT_OPTIONS);

  return `scrypt$32768$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
};

const verifyPassword = async (password, encodedHash) => {
  const parts = typeof encodedHash === 'string' ? encodedHash.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  if (n !== '32768' || r !== '8' || p !== '1' || !/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
    SCRYPT_OPTIONS
  );

  return crypto.timingSafeEqual(expected, actual);
};

const hashSessionToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const insertSession = async (queryable, userId) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await queryable.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashSessionToken(token), expiresAt]
  );

  return { token, expiresAt };
};

const registerUser = async (email, password) => {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash]
    );
    const user = result.rows[0];
    const session = await insertSession(client, user.id);
    await client.query('COMMIT');
    transactionStarted = false;

    return { user, ...session };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Authentication transaction rollback failed:', rollbackError.code || 'unknown error');
      }
    }
    throw error;
  } finally {
    client.release();
  }
};

const createLoginSession = async (user) => {
  const session = await insertSession(pool, user.id);
  return { user, ...session };
};

const authenticateCredentials = async (email, password) => {
  const result = await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    await hashPassword(password);
    return null;
  }

  return (await verifyPassword(password, user.password_hash))
    ? { id: user.id, email: user.email }
    : null;
};

const getUserForSession = async (token) => {
  const result = await pool.query(
    `SELECT u.id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)]
  );

  return result.rows[0] || null;
};

const revokeSession = async (token) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [
    hashSessionToken(token),
  ]);
};

module.exports = {
  SESSION_COOKIE_NAME,
  authenticateCredentials,
  createLoginSession,
  getUserForSession,
  registerUser,
  revokeSession,
};
