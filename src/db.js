'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Point it at your Postgres database ' +
      '(Netlify DB, Neon, Supabase, or a local server) before starting the app.'
  );
}

// Serverless functions run many short-lived instances, so each one keeps a small
// pool and lets idle connections go rather than holding them open.
const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 3),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ...(process.env.PG_SSL_NO_VERIFY === '1' ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (err) => console.error('idle postgres client error', err));

/** Queries are written with `?` placeholders and translated to Postgres's $1, $2… */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function all(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rows;
}

async function one(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

/** Returns the number of rows affected — used to detect lost races. */
async function run(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rowCount;
}

const SCHEMA_LOCK = 8_140_233; // Arbitrary, but stable across deploys.
let schemaReady = null;

async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    // Two cold starts can race here; the lock makes the loser wait rather than
    // trip over half-created tables.
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK]);
    await client.query(sql);
    await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK]);
  } finally {
    client.release();
  }
}

/** Awaited once per instance before the first query touches a table. */
function ready() {
  if (!schemaReady) {
    schemaReady = applySchema().catch((err) => {
      schemaReady = null; // Let the next request retry instead of failing forever.
      throw err;
    });
  }
  return schemaReady;
}

/** Housekeeping that would otherwise need a cron: cheap, and safe to repeat. */
async function purgeExpired() {
  await run('DELETE FROM sessions WHERE expires_at < now()');
  await run("DELETE FROM auth_attempts WHERE at < now() - interval '1 day'");
}

module.exports = { pool, all, one, run, ready, purgeExpired };
