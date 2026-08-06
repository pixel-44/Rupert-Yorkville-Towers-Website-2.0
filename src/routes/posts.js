'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { findOrCreateConversation } = require('./conversations');
const {
  CATEGORIES,
  PRICE_UNITS,
  priceLabel,
  timeAgo,
  formatDate,
  formatPhone,
  route,
} = require('../lib');

const router = express.Router();

const POST_SELECT = `
  SELECT p.*, u.name AS author_name, u.apartment AS author_apartment
  FROM posts p JOIN users u ON u.id = p.user_id`;

function postId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePrice(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return NaN;
  return n;
}

function readPostForm(body) {
  return {
    kind: body.kind === 'offer' ? 'offer' : 'need',
    category: CATEGORIES.includes(body.category) ? body.category : '',
    title: String(body.title || '').trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 4000),
    apartment: String(body.apartment || '').trim().toUpperCase().slice(0, 20),
    price_min: parsePrice(body.price_min),
    price_max: parsePrice(body.price_max),
    price_unit: Object.keys(PRICE_UNITS).includes(body.price_unit)
      ? body.price_unit
      : 'total',
    schedule: body.schedule === 'recurring' ? 'recurring' : 'one_time',
    recurrence: String(body.recurrence || '').trim().slice(0, 160),
  };
}

function validatePost(form) {
  const errors = [];
  if (!form.category) errors.push('Pick a category.');
  if (form.title.length < 4) errors.push('Give the post a short, clear title.');
  if (form.description.length < 10)
    errors.push('Add a few sentences describing what is involved.');
  if (!form.apartment) errors.push('Enter the apartment this is for.');
  if (Number.isNaN(form.price_min) || Number.isNaN(form.price_max))
    errors.push('Prices must be whole dollar amounts.');
  else if (
    form.price_min != null &&
    form.price_max != null &&
    form.price_min > form.price_max
  )
    errors.push('The low end of the price range cannot be above the high end.');
  if (form.schedule === 'recurring' && !form.recurrence)
    errors.push('Say how often a recurring job repeats (e.g. "weekdays at 6pm").');
  return errors;
}

/* ---------------------------------------------------------------- board --- */

router.get(
  '/board',
  route(async (req, res) => {
    const kind = ['need', 'offer'].includes(req.query.kind) ? req.query.kind : '';
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const schedule = ['one_time', 'recurring'].includes(req.query.schedule)
      ? req.query.schedule
      : '';
    const status = ['open', 'matched', 'completed'].includes(req.query.status)
      ? req.query.status
      : 'open';
    const q = String(req.query.q || '').trim().slice(0, 80);

    const where = ['p.status = ?'];
    const params = [status];
    if (kind) {
      where.push('p.kind = ?');
      params.push(kind);
    }
    if (category) {
      where.push('p.category = ?');
      params.push(category);
    }
    if (schedule) {
      where.push('p.schedule = ?');
      params.push(schedule);
    }
    if (q) {
      where.push('(p.title ILIKE ? OR p.description ILIKE ? OR p.category ILIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const posts = await db.all(
      `${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 200`,
      params
    );

    res.render('board', {
      title: 'Service board',
      posts,
      categories: CATEGORIES,
      filters: { kind, category, schedule, status, q },
      priceLabel,
      timeAgo,
    });
  })
);

/* ------------------------------------------------------------ post CRUD --- */

router.get('/posts/new', auth.requireMember, (req, res) => {
  res.render('post-form', {
    title: 'Post to the board',
    categories: CATEGORIES,
    priceUnits: PRICE_UNITS,
    errors: [],
    form: {
      kind: req.query.kind === 'offer' ? 'offer' : 'need',
      apartment: req.user.apartment,
      price_unit: 'total',
      schedule: 'one_time',
    },
    action: '/posts',
    submitLabel: 'Publish post',
  });
});

router.post(
  '/posts',
  auth.requireMember,
  route(async (req, res) => {
    const form = readPostForm(req.body);
    const errors = validatePost(form);

    if (errors.length) {
      return res.status(400).render('post-form', {
        title: 'Post to the board',
        categories: CATEGORIES,
        priceUnits: PRICE_UNITS,
        errors,
        form: req.body,
        action: '/posts',
        submitLabel: 'Publish post',
      });
    }

    const created = await db.one(
      `INSERT INTO posts
         (user_id, kind, category, title, description, apartment,
          price_min, price_max, price_unit, schedule, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        req.user.id,
        form.kind,
        form.category,
        form.title,
        form.description,
        form.apartment,
        form.price_min,
        form.price_max,
        form.price_unit,
        form.schedule,
        form.recurrence,
      ]
    );

    res.redirect(`/posts/${created.id}`);
  })
);

router.get(
  '/posts/:id',
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one(`${POST_SELECT} WHERE p.id = ?`, [id]) : null;
    if (!post) return res.status(404).render('404', { title: 'Post not found' });

    const author = await db.one(
      'SELECT id, name, apartment, bio, email, phone FROM users WHERE id = ?',
      [post.user_id]
    );
    const acceptor = post.accepted_by
      ? await db.one('SELECT id, name, apartment FROM users WHERE id = ?', [
          post.accepted_by,
        ])
      : null;

    const isOwner = !!req.user && req.user.id === post.user_id;
    const isAcceptor = !!req.user && req.user.id === post.accepted_by;

    // Contact details stay private until the two residents are actually working together.
    const showContact = isOwner || isAcceptor;

    res.render('post', {
      title: post.title,
      post,
      author,
      acceptor,
      isOwner,
      isAcceptor,
      showContact,
      authorPhone: formatPhone(author.phone),
      priceLabel,
      timeAgo,
      formatDate,
    });
  })
);

router.get(
  '/posts/:id/edit',
  auth.requireMember,
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (!post || post.user_id !== req.user.id)
      return res.status(404).render('404', { title: 'Post not found' });

    res.render('post-form', {
      title: 'Edit post',
      categories: CATEGORIES,
      priceUnits: PRICE_UNITS,
      errors: [],
      form: post,
      action: `/posts/${post.id}/edit`,
      submitLabel: 'Save changes',
    });
  })
);

router.post(
  '/posts/:id/edit',
  auth.requireMember,
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (!post || post.user_id !== req.user.id)
      return res.status(404).render('404', { title: 'Post not found' });

    const form = readPostForm(req.body);
    const errors = validatePost(form);

    if (errors.length) {
      return res.status(400).render('post-form', {
        title: 'Edit post',
        categories: CATEGORIES,
        priceUnits: PRICE_UNITS,
        errors,
        form: { ...req.body, id: post.id },
        action: `/posts/${post.id}/edit`,
        submitLabel: 'Save changes',
      });
    }

    await db.run(
      `UPDATE posts SET kind = ?, category = ?, title = ?, description = ?, apartment = ?,
         price_min = ?, price_max = ?, price_unit = ?, schedule = ?, recurrence = ?
       WHERE id = ?`,
      [
        form.kind,
        form.category,
        form.title,
        form.description,
        form.apartment,
        form.price_min,
        form.price_max,
        form.price_unit,
        form.schedule,
        form.recurrence,
        post.id,
      ]
    );

    res.redirect(`/posts/${post.id}`);
  })
);

/* ------------------------------------------------------------- matching --- */

router.post(
  '/posts/:id/accept',
  auth.requireMember,
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (!post) return res.status(404).render('404', { title: 'Post not found' });
    if (post.user_id === req.user.id) return res.redirect(`/posts/${post.id}`);

    // Conditional update: whoever gets there first wins, even across instances.
    const claimed = await db.run(
      `UPDATE posts SET status = 'matched', accepted_by = ?, accepted_at = now()
       WHERE id = ? AND status = 'open'`,
      [req.user.id, post.id]
    );

    if (claimed === 0) {
      // Someone else accepted first — send them to the post so they see the new state.
      return res.redirect(`/posts/${post.id}?taken=1`);
    }

    const convo = await findOrCreateConversation(post.id, post.user_id, req.user.id);
    await db.run(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
      [
        convo.id,
        req.user.id,
        `Hi — I just accepted your post "${post.title}". Let's sort out the details here.`,
      ]
    );

    res.redirect(`/messages/${convo.id}`);
  })
);

/** Ask a question without committing to the job. */
router.post(
  '/posts/:id/ask',
  auth.requireMember,
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (!post) return res.status(404).render('404', { title: 'Post not found' });
    if (post.user_id === req.user.id) return res.redirect(`/posts/${post.id}`);

    const convo = await findOrCreateConversation(post.id, post.user_id, req.user.id);
    const body = String(req.body.body || '').trim().slice(0, 4000);
    if (body) {
      await db.run(
        'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
        [convo.id, req.user.id, body]
      );
    }
    res.redirect(`/messages/${convo.id}`);
  })
);

router.post(
  '/posts/:id/status',
  auth.requireMember,
  route(async (req, res) => {
    const id = postId(req);
    const post = id ? await db.one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (!post) return res.status(404).render('404', { title: 'Post not found' });

    const isOwner = post.user_id === req.user.id;
    const isAcceptor = post.accepted_by === req.user.id;
    if (!isOwner && !isAcceptor) return res.status(403).redirect(`/posts/${post.id}`);

    const action = String(req.body.action || '');

    if (action === 'complete' && post.status === 'matched') {
      await db.run("UPDATE posts SET status = 'completed' WHERE id = ?", [post.id]);
    } else if (action === 'withdraw' && isAcceptor && post.status === 'matched') {
      await db.run(
        "UPDATE posts SET status = 'open', accepted_by = NULL, accepted_at = NULL WHERE id = ?",
        [post.id]
      );
    } else if (action === 'reopen' && isOwner && post.status !== 'open') {
      await db.run(
        "UPDATE posts SET status = 'open', accepted_by = NULL, accepted_at = NULL WHERE id = ?",
        [post.id]
      );
    } else if (action === 'cancel' && isOwner && post.status !== 'completed') {
      await db.run("UPDATE posts SET status = 'cancelled' WHERE id = ?", [post.id]);
    }

    res.redirect(`/posts/${post.id}`);
  })
);

/* --------------------------------------------------------------- my page -- */

router.get(
  '/my-posts',
  auth.requireMember,
  route(async (req, res) => {
    const mine = await db.all(
      `${POST_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const accepted = await db.all(
      `${POST_SELECT} WHERE p.accepted_by = ? ORDER BY p.accepted_at DESC`,
      [req.user.id]
    );

    res.render('my-posts', {
      title: 'Your posts',
      mine,
      accepted,
      priceLabel,
      timeAgo,
    });
  })
);

module.exports = router;
