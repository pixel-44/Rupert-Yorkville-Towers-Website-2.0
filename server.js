'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const db = require('./src/db');
const auth = require('./src/auth');
const accountRoutes = require('./src/routes/accounts');
const postRoutes = require('./src/routes/posts');
const { router: conversationRoutes, unreadCount } = require('./src/routes/conversations');
const { priceLabel, timeAgo, CATEGORIES } = require('./src/lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Hosting platforms terminate TLS in front of us; trust their forwarded headers
// so secure cookies and rate limiting see the real client.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const isProduction = process.env.NODE_ENV === 'production';

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
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(auth.loadUser);

// Site-wide values every template needs.
app.use((req, res, next) => {
  res.locals.unread = req.user ? unreadCount(req.user.id) : 0;
  res.locals.currentPath = req.path;
  res.locals.help = {
    email: 'kieran4v@gmail.com',
    phone: '646-617-0040',
    phoneHref: '+16466170040',
  };
  next();
});

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

app.get('/', (req, res) => {
  const recent = db
    .prepare(
      `SELECT p.*, u.name AS author_name, u.apartment AS author_apartment
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'open'
       ORDER BY p.created_at DESC LIMIT 6`
    )
    .all();
  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS members,
         (SELECT COUNT(*) FROM posts WHERE status = 'open') AS open_posts,
         (SELECT COUNT(*) FROM posts WHERE status = 'completed') AS completed`
    )
    .get();

  res.render('home', {
    title: 'Rupert Yorkville Towers Resident Board',
    recent,
    stats,
    categories: CATEGORIES.slice(0, 8),
    priceLabel,
    timeAgo,
  });
});

app.get('/guidelines', (req, res) =>
  res.render('guidelines', { title: 'How the board works' })
);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(accountRoutes);
app.use(postRoutes);
app.use(conversationRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Rupert Yorkville Towers board running on http://localhost:${PORT}`);
});
