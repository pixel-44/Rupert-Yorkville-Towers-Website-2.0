'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { formatPhone, formatDate, timeAgo } = require('../lib');

const router = express.Router();

/** One thread per (post, pair of residents), regardless of who opened it. */
function findOrCreateConversation(postId, userOne, userTwo) {
  const a = Math.min(userOne, userTwo);
  const b = Math.max(userOne, userTwo);
  const existing = db
    .prepare(
      `SELECT * FROM conversations
       WHERE user_a = ? AND user_b = ? AND post_id IS ?`
    )
    .get(a, b, postId ?? null);
  if (existing) return existing;

  const info = db
    .prepare('INSERT INTO conversations (post_id, user_a, user_b) VALUES (?, ?, ?)')
    .run(postId ?? null, a, b);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
}

function loadConversationFor(conversationId, userId) {
  const convo = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(conversationId);
  if (!convo) return null;
  if (convo.user_a !== userId && convo.user_b !== userId) return null;
  return convo;
}

function otherPartyId(convo, userId) {
  return convo.user_a === userId ? convo.user_b : convo.user_a;
}

function unreadCount(userId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.sender_id <> ? AND m.read_at IS NULL
         AND (c.user_a = ? OR c.user_b = ?)`
    )
    .get(userId, userId, userId);
  return row ? row.n : 0;
}

function listThreads(userId) {
  return db
    .prepare(
      `SELECT c.id,
              c.post_id,
              p.title       AS post_title,
              p.status      AS post_status,
              u.id          AS other_id,
              u.name        AS other_name,
              u.apartment   AS other_apartment,
              (SELECT body FROM messages
                 WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
              (SELECT created_at FROM messages
                 WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_at,
              (SELECT COUNT(*) FROM messages
                 WHERE conversation_id = c.id AND sender_id <> ? AND read_at IS NULL)
                            AS unread
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
       LEFT JOIN posts p ON p.id = c.post_id
       WHERE c.user_a = ? OR c.user_b = ?
       ORDER BY COALESCE(last_at, c.created_at) DESC`
    )
    .all(userId, userId, userId, userId);
}

router.get('/messages', auth.requireMember, (req, res) => {
  res.render('threads', {
    title: 'Messages',
    threads: listThreads(req.user.id),
    timeAgo,
  });
});

router.get('/messages/:id', auth.requireMember, (req, res) => {
  const convo = loadConversationFor(Number(req.params.id), req.user.id);
  if (!convo) return res.status(404).render('404', { title: 'Not found' });

  const other = db
    .prepare('SELECT id, name, apartment, email, phone FROM users WHERE id = ?')
    .get(otherPartyId(convo, req.user.id));
  const post = convo.post_id
    ? db.prepare('SELECT * FROM posts WHERE id = ?').get(convo.post_id)
    : null;

  db.prepare(
    `UPDATE messages SET read_at = datetime('now')
     WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`
  ).run(convo.id, req.user.id);

  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id')
    .all(convo.id);

  res.render('thread', {
    title: `Messages with ${other.name}`,
    convo,
    other,
    otherPhone: formatPhone(other.phone),
    post,
    messages,
    formatDate,
  });
});

/** Polled by the open thread page so new messages land without a refresh. */
router.get('/api/messages/:id', auth.requireMember, (req, res) => {
  const convo = loadConversationFor(Number(req.params.id), req.user.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

  const after = Number(req.query.after || 0);
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id')
    .all(convo.id, Number.isFinite(after) ? after : 0);

  db.prepare(
    `UPDATE messages SET read_at = datetime('now')
     WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`
  ).run(convo.id, req.user.id);

  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.sender_id === req.user.id,
      at: formatDate(m.created_at),
    })),
  });
});

router.post('/messages/:id', auth.requireMember, (req, res) => {
  const convo = loadConversationFor(Number(req.params.id), req.user.id);
  if (!convo) return res.status(404).render('404', { title: 'Not found' });

  const body = String(req.body.body || '').trim().slice(0, 4000);
  if (body) {
    db.prepare(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)'
    ).run(convo.id, req.user.id, body);
  }
  res.redirect(`/messages/${convo.id}`);
});

module.exports = {
  router,
  findOrCreateConversation,
  unreadCount,
};
