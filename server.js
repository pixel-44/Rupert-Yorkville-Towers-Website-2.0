'use strict';

// Local development entry point. On Netlify the same app runs inside
// netlify/functions/server.js instead of listening on a port.
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Rupert Yorkville Towers board running on http://localhost:${PORT}`);
});
