'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { formatPhone, formatDate, timeAgo, route } = require('../lib');

const router = express.Router();

/** One thread per (post, pair of residents), regardless of who opened it. */
async function findOrCreateConversation(postId, userOne, userTwo) {
  const a = Math.min(userOne, userTwo);
  const b = Math.max(userOne, userTwo);
  const post = postId ?? null;

  const existing = await db.one(
    `SELECT * FROM conversations
     WHERE user_a = ? AND user_b = ? AND post_id IS NOT DISTINCT FROM ?`,
    [a, b, post]
  );
  if (existing) return existing;

  // Two simultaneous "accept" clicks would both try to open the thread; the
  // unique indexes make the second one a no-op that we then read back.
  const inserted = await db.one(
    `INSERT INTO conversations (post_id, user_a, user_b)
     VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [post, a, b]
  );
  if (inserted) return inserted;

  return db.one(
    `SELECT * FROM conversations
     WHERE user_a = ? AND user_b = ? AND post_id IS NOT DISTINCT FROM ?`,
    [a, b, post]
  );
}

async function loadConversationFor(conversationId, userId) {
  if (!Number.isInteger(conversationId)) return null;
  const convo = await db.one('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  if (!convo) return null;
  if (convo.user_a !== userId && convo.user_b !== userId) return null;
  return convo;
}

function otherPartyId(convo, userId) {
  return convo.user_a === userId ? convo.user_b : convo.user_a;
}

async function unreadCount(userId) {
  const row = await db.one(
    `SELECT COUNT(*)::int AS n FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.sender_id <> ? AND m.read_at IS NULL
       AND (c.user_a = ? OR c.user_b = ?)`,
    [userId, userId, userId]
  );
  return row ? row.n : 0;
}

async function markRead(conversationId, readerId) {
  await db.run(
    `UPDATE messages SET read_at = now()
     WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
    [conversationId, readerId]
  );
}

async function listThreads(userId) {
  return db.all(
    `SELECT * FROM (
       SELECT c.id,
              c.post_id,
              c.created_at   AS started_at,
              p.title        AS post_title,
              p.status       AS post_status,
              u.id           AS other_id,
              u.name         AS other_name,
              u.apartment    AS other_apartment,
              last.body      AS last_body,
              last.created_at AS last_at,
              unread.n       AS unread
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
       LEFT JOIN posts p ON p.id = c.post_id
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messages
         WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
       ) last ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS n FROM messages
         WHERE conversation_id = c.id AND sender_id <> ? AND read_at IS NULL
       ) unread ON true
       WHERE c.user_a = ? OR c.user_b = ?
     ) threads
     ORDER BY COALESCE(last_at, started_at) DESC`,
    [userId, userId, userId, userId]
  );
}

router.get(
  '/messages',
  auth.requireMember,
  route(async (req, res) => {
    res.render('threads', {
      title: 'Messages',
      threads: await listThreads(req.user.id),
      timeAgo,
    });
  })
);

router.get(
  '/messages/:id',
  auth.requireMember,
  route(async (req, res) => {
    const convo = await loadConversationFor(Number(req.params.id), req.user.id);
    if (!convo) return res.status(404).render('404', { title: 'Not found' });

    const other = await db.one(
      'SELECT id, name, apartment, email, phone FROM users WHERE id = ?',
      [otherPartyId(convo, req.user.id)]
    );
    const post = convo.post_id
      ? await db.one('SELECT * FROM posts WHERE id = ?', [convo.post_id])
      : null;

    await markRead(convo.id, req.user.id);

    const messages = await db.all(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id',
      [convo.id]
    );

    res.render('thread', {
      title: `Messages with ${other.name}`,
      convo,
      other,
      otherPhone: formatPhone(other.phone),
      post,
      messages,
      formatDate,
    });
  })
);

/** Polled by the open thread page so new messages land without a refresh. */
router.get(
  '/api/messages/:id',
  auth.requireMember,
  route(async (req, res) => {
    const convo = await loadConversationFor(Number(req.params.id), req.user.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

    const after = Number(req.query.after || 0);
    const messages = await db.all(
      'SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id',
      [convo.id, Number.isFinite(after) ? after : 0]
    );

    await markRead(convo.id, req.user.id);

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        mine: m.sender_id === req.user.id,
        at: formatDate(m.created_at),
      })),
    });
  })
);

router.post(
  '/messages/:id',
  auth.requireMember,
  route(async (req, res) => {
    const convo = await loadConversationFor(Number(req.params.id), req.user.id);
    if (!convo) return res.status(404).render('404', { title: 'Not found' });

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

module.exports = {
  router,
  findOrCreateConversation,
  unreadCount,
};
