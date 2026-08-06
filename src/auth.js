'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE = 'ryt_session';
const SESSION_DAYS = 30;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function checkPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, now() + interval '${SESSION_DAYS} days')`,
    [token, userId]
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

async function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.clearCookie(COOKIE);
}

/** Attaches req.user (or null) to every request. */
async function loadUser(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    req.user = null;
    if (token) {
      const row = await db.one(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > now()`,
        [token]
      );
      if (row) req.user = row;
      else res.clearCookie(COOKIE);
    }
    res.locals.user = req.user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Gate for anything that changes data: browsing stays open to everyone. */
function requireMember(req, res, next) {
  if (req.user) return next();
  if (req.accepts('html')) {
    const back = encodeURIComponent(req.originalUrl);
    return res.redirect(`/signup?next=${back}`);
  }
  return res.status(401).json({ error: 'You need a resident account to do that.' });
}

/**
 * Password guessing throttle. Serverless instances have no shared memory, so
 * attempts are counted in the database and apply across the whole site.
 */
const ATTEMPT_LIMIT = 40;
const ATTEMPT_WINDOW_MINUTES = 15;

async function throttleAuth(req, res, next) {
  try {
    const ip = req.ip || 'unknown';
    await db.run('INSERT INTO auth_attempts (ip) VALUES (?)', [ip]);
    const row = await db.one(
      `SELECT COUNT(*)::int AS n FROM auth_attempts
       WHERE ip = ? AND at > now() - interval '${ATTEMPT_WINDOW_MINUTES} minutes'`,
      [ip]
    );
    if (row && row.n > ATTEMPT_LIMIT) {
      return res.status(429).render('error', {
        title: 'Too many attempts',
        message:
          'Too many sign-in attempts from this connection. Wait a few minutes and try again.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  COOKIE,
  hashPassword,
  checkPassword,
  startSession,
  endSession,
  loadUser,
  requireMember,
  throttleAuth,
};
