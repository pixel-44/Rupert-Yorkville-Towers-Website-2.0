'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const ejs = require('ejs');

const db = require('./db');
const auth = require('./auth');
const accountRoutes = require('./routes/accounts');
const postRoutes = require('./routes/posts');
const { router: conversationRoutes, unreadCount } = require('./routes/conversations');
const { priceLabel, timeAgo, CATEGORIES, route } = require('./lib');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const ROOT = path.join(__dirname, '..');

// Netlify terminates TLS in front of the function; trust its forwarded headers
// so secure cookies and IP-based throttling see the real client.
app.set('trust proxy', true);
// Registering the engine explicitly (rather than letting Express require('ejs')
// by name at runtime) is what keeps EJS in the bundle Netlify ships.
app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

app.use(
  helmet({
    // Helmet's default of no-referrer also blanks the Origin header browsers send
    // with form posts, which the same-origin check below relies on.
    referrerPolicy: { policy: 'same-origin' },
    // HTTPS upgrades belong in production; on a plain http://localhost run they
    // just make the browser fail to load the page's own assets.
    hsts: isProduction,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
  })
);
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use(cookieParser());

// On Netlify the CDN serves everything in public/ before the function is reached.
// This keeps `npm start` self-sufficient for local work.
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));

// The database schema is applied once per instance, before the first query.
app.use(
  route(async (req, res, next) => {
    await db.ready();
    next();
  })
);

app.use(auth.loadUser);

// Site-wide values every template needs.
app.use(
  route(async (req, res, next) => {
    res.locals.unread = req.user ? await unreadCount(req.user.id) : 0;
    res.locals.currentPath = req.path;
    res.locals.help = {
      email: 'kieran4v@gmail.com',
      phone: '646-617-0040',
      phoneHref: '+16466170040',
    };
    next();
  })
);

// Cross-site request forgery guard: session cookies are SameSite=Lax, and any
// state-changing request must also come from this site's own pages.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next(); // Non-browser clients send neither header.
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).render('error', { title: 'Blocked request' });
  }
  if (host !== req.get('host')) {
    return res.status(403).render('error', { title: 'Blocked request' });
  }
  next();
});

app.get(
  '/',
  route(async (req, res) => {
    const recent = await db.all(
      `SELECT p.*, u.name AS author_name, u.apartment AS author_apartment
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'open'
       ORDER BY p.created_at DESC LIMIT 6`
    );
    const stats = await db.one(
      `SELECT
         (SELECT COUNT(*)::int FROM users) AS members,
         (SELECT COUNT(*)::int FROM posts WHERE status = 'open') AS open_posts,
         (SELECT COUNT(*)::int FROM posts WHERE status = 'completed') AS completed`
    );

    res.render('home', {
      title: 'Rupert Yorkville Towers Resident Board',
      recent,
      stats,
      categories: CATEGORIES.slice(0, 8),
      priceLabel,
      timeAgo,
    });
  })
);

app.get('/guidelines', (req, res) =>
  res.render('guidelines', { title: 'How the board works' })
);

/** Also does the housekeeping a long-running server used to do on a timer. */
app.get(
  '/healthz',
  route(async (req, res) => {
    await db.ready();
    await db.purgeExpired();
    res.json({ ok: true });
  })
);

app.use(accountRoutes);
app.use(postRoutes);
app.use(conversationRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong' });
});

module.exports = app;
