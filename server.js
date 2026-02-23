/**
 * Minimal static file server for the Fair Work Award Calculator.
 * Serves the client-side app and reference data (CSVs) for deployment on Railway.
 * Uses PORT from environment (Railway sets this).
 */

import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Serve static files from project root (index.html, config.html, src/, data/, styles.css, etc.)
app.use(express.static(__dirname));

// Health check for Railway
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'award-interpreter' });
});

// SPA-style fallback: serve index.html for root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Award Interpreter serving at http://localhost:${PORT}`);
});
