'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const {
  normalizeEmail,
  normalizePhone,
  isPersonalEmail,
  formatPhone,
  route,
} = require('../lib');

const router = express.Router();

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/board';
}

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/board');
  res.render('signup', {
    title: 'Create your resident account',
    errors: [],
    form: {},
    next: safeNext(req.query.next),
  });
});

router.post(
  '/signup',
  auth.throttleAuth,
  route(async (req, res) => {
    const form = {
      name: String(req.body.name || '').trim(),
      email: normalizeEmail(req.body.email),
      phone: normalizePhone(req.body.phone),
      apartment: String(req.body.apartment || '').trim().toUpperCase(),
      bio: String(req.body.bio || '').trim().slice(0, 400),
    };
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const errors = [];

    if (form.name.length < 2) errors.push('Enter your first and last name.');
    if (!isPersonalEmail(form.email))
      errors.push('Enter a personal email address you actually check.');
    if (form.phone.length !== 10)
      errors.push('Enter a 10-digit US phone number — neighbors use it to reach you.');
    if (!form.apartment) errors.push('Enter your apartment number.');
    if (password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== confirm) errors.push('The two passwords do not match.');

    if (!errors.length) {
      const taken = await db.one(
        'SELECT email, phone FROM users WHERE email = ? OR phone = ?',
        [form.email, form.phone]
      );
      if (taken && taken.email === form.email)
        errors.push('An account already uses that email. Try logging in.');
      else if (taken) errors.push('An account already uses that phone number.');
    }

    if (errors.length) {
      return res.status(400).render('signup', {
        title: 'Create your resident account',
        errors,
        form: { ...form, phone: formatPhone(form.phone) },
        next: safeNext(req.body.next),
      });
    }

    const created = await db.one(
      `INSERT INTO users (name, email, phone, apartment, password_hash, bio)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        form.name,
        form.email,
        form.phone,
        form.apartment,
        auth.hashPassword(password),
        form.bio,
      ]
    );

    await auth.startSession(res, created.id);
    res.redirect(safeNext(req.body.next));
  })
);

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/board');
  res.render('login', {
    title: 'Log in',
    errors: [],
    form: {},
    next: safeNext(req.query.next),
  });
});

router.post(
  '/login',
  auth.throttleAuth,
  route(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !auth.checkPassword(password, user.password_hash)) {
      return res.status(401).render('login', {
        title: 'Log in',
        errors: ['That email and password combination did not match an account.'],
        form: { email },
        next: safeNext(req.body.next),
      });
    }

    await auth.startSession(res, user.id);
    res.redirect(safeNext(req.body.next));
  })
);

router.post(
  '/logout',
  route(async (req, res) => {
    await auth.endSession(req, res);
    res.redirect('/');
  })
);

router.get('/account', auth.requireMember, (req, res) => {
  res.render('account', {
    title: 'Your account',
    errors: [],
    saved: req.query.saved === '1',
    form: { ...req.user, phone: formatPhone(req.user.phone) },
  });
});

router.post(
  '/account',
  auth.requireMember,
  route(async (req, res) => {
    const form = {
      name: String(req.body.name || '').trim(),
      email: normalizeEmail(req.body.email),
      phone: normalizePhone(req.body.phone),
      apartment: String(req.body.apartment || '').trim().toUpperCase(),
      bio: String(req.body.bio || '').trim().slice(0, 400),
    };
    const errors = [];

    if (form.name.length < 2) errors.push('Enter your first and last name.');
    if (!isPersonalEmail(form.email)) errors.push('Enter a valid personal email address.');
    if (form.phone.length !== 10) errors.push('Enter a 10-digit US phone number.');
    if (!form.apartment) errors.push('Enter your apartment number.');

    if (!errors.length) {
      const clash = await db.one(
        'SELECT 1 FROM users WHERE (email = ? OR phone = ?) AND id <> ?',
        [form.email, form.phone, req.user.id]
      );
      if (clash) errors.push('Another account already uses that email or phone number.');
    }

    if (errors.length) {
      return res.status(400).render('account', {
        title: 'Your account',
        errors,
        saved: false,
        form: { ...form, phone: formatPhone(form.phone) },
      });
    }

    await db.run(
      `UPDATE users SET name = ?, email = ?, phone = ?, apartment = ?, bio = ?
       WHERE id = ?`,
      [form.name, form.email, form.phone, form.apartment, form.bio, req.user.id]
    );

    res.redirect('/account?saved=1');
  })
);

router.post(
  '/account/password',
  auth.requireMember,
  auth.throttleAuth,
  route(async (req, res) => {
    const current = String(req.body.current_password || '');
    const next = String(req.body.new_password || '');
    const confirm = String(req.body.confirm_password || '');
    const errors = [];

    if (!auth.checkPassword(current, req.user.password_hash))
      errors.push('Your current password is not correct.');
    if (next.length < 8) errors.push('New password must be at least 8 characters.');
    if (next !== confirm) errors.push('The two new passwords do not match.');

    if (errors.length) {
      return res.status(400).render('account', {
        title: 'Your account',
        errors,
        saved: false,
        form: { ...req.user, phone: formatPhone(req.user.phone) },
      });
    }

    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [
      auth.hashPassword(next),
      req.user.id,
    ]);
    // Signing out other devices is the point of a password change.
    await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
    await auth.startSession(res, req.user.id);
    res.redirect('/account?saved=1');
  })
);

module.exports = router;
