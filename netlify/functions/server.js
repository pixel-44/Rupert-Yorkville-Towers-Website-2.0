'use strict';

// Netlify entry point: the whole Express app runs as one function, with the
// redirect in netlify.toml sending every non-static request here.
const serverless = require('serverless-http');
const app = require('../../src/app');

exports.handler = serverless(app, {
  binary: false,
  request(request, event) {
    // Netlify gives the function the original path on a rewrite; keep the
    // client's protocol so redirects and secure cookies stay on https.
    const proto = event.headers['x-forwarded-proto'];
    if (proto) request.headers['x-forwarded-proto'] = proto;
  },
});
