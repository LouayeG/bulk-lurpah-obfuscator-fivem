require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');

const { profile } = require('./src/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Expose the active profile so the UI can show exactly what will be applied.
app.get('/api/settings', (req, res) => {
  res.json({ profile, hasApiKey: Boolean(process.env.LPH_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`Luraph obfuscator running on http://localhost:${PORT}`);
});
