'use strict';

const CATEGORIES = [
  'Dog walking',
  'Pet sitting',
  'Babysitting',
  'Childcare pickup',
  'Cleaning',
  'Laundry',
  'Grocery run',
  'Package pickup',
  'Plant watering',
  'Handyman / repairs',
  'Tech help',
  'Tutoring',
  'Moving help',
  'Elder care / company',
  'Cooking',
  'Other',
];

const PRICE_UNITS = {
  total: 'total',
  hour: 'per hour',
  day: 'per day',
  week: 'per week',
  month: 'per month',
  visit: 'per visit',
};

/** Store phones as 10 digits; render them as (646) 617-0040. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function formatPhone(digits) {
  if (!digits || digits.length !== 10) return digits || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value);
}

/** Personal email required — building/service inboxes are not a way to reach a person. */
function isPersonalEmail(value) {
  return isEmail(value) && !/^(info|admin|noreply|no-reply|support)@/i.test(value);
}

function priceLabel(post) {
  const unit = PRICE_UNITS[post.price_unit] || '';
  if (post.price_min == null && post.price_max == null) return 'Open to offers';
  if (post.price_min != null && post.price_max != null) {
    if (post.price_min === post.price_max) return `$${post.price_min} ${unit}`.trim();
    return `$${post.price_min}–$${post.price_max} ${unit}`.trim();
  }
  const single = post.price_min ?? post.price_max;
  return `$${single} ${unit}`.trim();
}

/** "3 hours ago" style stamps. Postgres hands back Date objects. */
function timeAgo(value) {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const mins = seconds / 60;
  const hours = mins / 60;
  const days = hours / 24;
  if (seconds < 60) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (hours < 24) return `${Math.floor(hours)} hr ago`;
  if (days < 7) return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Express 4 does not catch rejected promises from route handlers, so every async
 * handler is wrapped to hand errors to the error middleware.
 */
function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = {
  CATEGORIES,
  PRICE_UNITS,
  normalizePhone,
  formatPhone,
  normalizeEmail,
  isEmail,
  isPersonalEmail,
  priceLabel,
  timeAgo,
  formatDate,
  route,
};
