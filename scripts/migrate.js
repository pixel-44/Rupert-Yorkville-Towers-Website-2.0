#!/usr/bin/env node
'use strict';

// Applies src/schema.sql to the database in DATABASE_URL.
//
//   node scripts/migrate.js           create anything missing (safe to re-run)
//   node scripts/migrate.js --reset   drop every table first — destroys all data
//
// The app also applies the schema itself on first request, so this script is for
// setting a database up ahead of time and for wiping test databases.

const db = require('../src/db');

const RESET_SQL = `
DROP TABLE IF EXISTS auth_attempts, messages, conversations, posts, sessions, users CASCADE;
`;

(async () => {
  const reset = process.argv.includes('--reset');

  if (reset) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_RESET !== 'yes') {
      console.error(
        'Refusing to --reset a production database. Set ALLOW_RESET=yes if you mean it.'
      );
      process.exit(1);
    }
    console.log('Dropping existing tables…');
    await db.pool.query(RESET_SQL);
  }

  await db.ready();
  const { rows } = await db.pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log('Schema applied. Tables:', rows.map((r) => r.table_name).join(', '));
  await db.pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
