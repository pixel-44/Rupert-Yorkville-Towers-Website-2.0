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

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`
  ).run(token, userId);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
}

/** Attaches req.user (or null) to every request. */
function loadUser(req, res, next) {
  const token = req.cookies[COOKIE];
  req.user = null;
  if (token) {
    const row = db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .get(token);
    if (row) req.user = row;
    else res.clearCookie(COOKIE);
  }
  res.locals.user = req.user;
  next();
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

module.exports = {
  COOKIE,
  hashPassword,
  checkPassword,
  startSession,
  endSession,
  loadUser,
  requireMember,
};
