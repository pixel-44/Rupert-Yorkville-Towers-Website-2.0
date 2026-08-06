#!/usr/bin/env node
'use strict';

// Exercises the Netlify function entry point directly, with the Lambda-style
// events Netlify sends after a rewrite. This is what catches problems the plain
// `npm start` tests can't see: template paths inside the bundle, cookies coming
// back through multiValueHeaders, and the original URL surviving the rewrite.
//
// Needs TEST_DATABASE_URL (or DATABASE_URL) pointing at a throwaway database.

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a throwaway Postgres database.');
  process.exit(1);
}

const { handler } = require('../netlify/functions/server');
const db = require('../src/db');

const HOST = 'resident-board.netlify.app';
let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function invoke(method, path, { body, cookie, headers = {} } = {}) {
  const [rawPath, query] = path.split('?');
  const queryStringParameters = {};
  if (query) {
    for (const [k, v] of new URLSearchParams(query)) queryStringParameters[k] = v;
  }
  return handler(
    {
      httpMethod: method,
      path: rawPath,
      rawUrl: `https://${HOST}${path}`,
      queryStringParameters,
      headers: {
        host: HOST,
        'x-forwarded-proto': 'https',
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(body ? { origin: `https://${HOST}` } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body || null,
      isBase64Encoded: false,
    },
    { awsRequestId: 'test', getRemainingTimeInMillis: () => 10000 }
  );
}

/**
 * Netlify accepts Set-Cookie in either bag; serverless-http mirrors whichever
 * shape the incoming event used, so both are checked.
 */
function cookieHeaders(res) {
  const multi = (res.multiValueHeaders && res.multiValueHeaders['set-cookie']) || [];
  const single =
    res.headers && res.headers['set-cookie'] ? [].concat(res.headers['set-cookie']) : [];
  return [...multi, ...single];
}

function setCookie(res) {
  const session = cookieHeaders(res).find((c) => c.startsWith('ryt_session='));
  return session ? session.split(';')[0] : null;
}

(async () => {
  console.log('Netlify function handler');

  await db.pool.query(
    'DROP TABLE IF EXISTS auth_attempts, messages, conversations, posts, sessions, users CASCADE'
  );

  const home = await invoke('GET', '/');
  check('GET / renders', home.statusCode === 200, `status ${home.statusCode}`);
  check('templates resolve inside the bundle', home.body.includes('Neighbors helping neighbors'));
  check('User Help panel present', home.body.includes('646-617-0040'));

  const board = await invoke('GET', '/board?category=Cleaning');
  check('rewritten path keeps its query string', board.statusCode === 200 && board.body.includes('Service board'));

  const guestPost = await invoke('GET', '/posts/new');
  check('guest is redirected to signup', guestPost.statusCode === 302, `status ${guestPost.statusCode}`);

  const signup = await invoke('POST', '/signup', {
    body: new URLSearchParams({
      name: 'Ana Ruiz',
      email: 'ana@example.com',
      phone: '2125550142',
      apartment: '14C',
      password: 'hunter22',
      confirm: 'hunter22',
    }).toString(),
  });
  check('signup succeeds', signup.statusCode === 302, `status ${signup.statusCode}`);

  const cookie = setCookie(signup);
  check('session cookie comes back through the function', !!cookie);
  const cookieIsSecure = /;\s*Secure/i.test(cookieHeaders(signup).join('|'));
  check(
    'cookie is https-only exactly when running in production mode',
    cookieIsSecure === (process.env.NODE_ENV === 'production'),
    `Secure=${cookieIsSecure}, NODE_ENV=${process.env.NODE_ENV || 'unset'}`
  );

  // Netlify sends multiValueHeaders on real requests; make sure cookies survive
  // that shape too, since that is the path production actually takes.
  const multiSignup = await handler(
    {
      httpMethod: 'POST',
      path: '/signup',
      queryStringParameters: {},
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded', origin: `https://${HOST}` },
      multiValueHeaders: { host: [HOST], origin: [`https://${HOST}`] },
      body: new URLSearchParams({
        name: 'Ben Ito',
        email: 'ben@example.com',
        phone: '9175550110',
        apartment: '9B',
        password: 'hunter22',
        confirm: 'hunter22',
      }).toString(),
      isBase64Encoded: false,
    },
    {}
  );
  check('cookies survive the multiValueHeaders event shape', !!setCookie(multiSignup));

  const account = await invoke('GET', '/account', { cookie });
  check('session is recognised on the next invocation', account.statusCode === 200 && account.body.includes('ana@example.com'));

  const create = await invoke('POST', '/posts', {
    cookie,
    body: new URLSearchParams({
      kind: 'need',
      category: 'Dog walking',
      title: 'Evening dog walk for a beagle',
      description: 'Twenty minutes around the block each weekday evening.',
      apartment: '14C',
      price_min: '20',
      price_max: '30',
      price_unit: 'visit',
      schedule: 'recurring',
      recurrence: 'Weekdays around 6pm',
    }).toString(),
  });
  check('post is created', create.statusCode === 302 && /\/posts\/\d+/.test(create.headers.location || ''), create.headers.location);

  const detail = await invoke('GET', create.headers.location, { cookie });
  check('post detail renders', detail.statusCode === 200 && detail.body.includes('Evening dog walk'));

  const csrf = await invoke('POST', '/posts', {
    cookie,
    headers: { origin: 'https://evil.example' },
    body: 'kind=need',
  });
  check('cross-site POST is refused', csrf.statusCode === 403, `status ${csrf.statusCode}`);

  const missing = await invoke('GET', '/nope');
  check('unknown path renders the 404 page', missing.statusCode === 404);

  const health = await invoke('GET', '/healthz');
  check('healthz responds', health.statusCode === 200 && JSON.parse(health.body).ok === true);

  await db.pool.end();
  console.log(failures ? `\n${failures} FAILED` : '\nfunction handler OK');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
