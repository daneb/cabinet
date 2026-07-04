// Minimal static file server for local development with disk-backed persistence.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 8765;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, 'data');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.jsx': 'application/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : null); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // ---- API: disk-backed saves ----

  if (req.method === 'GET' && urlPath === '/api/saves') {
    const data = readJSON(SAVES_FILE) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/saves') {
    try {
      const data = await readBody(req);
      writeJSON(SAVES_FILE, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    }
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/library') {
    const data = readJSON(LIBRARY_FILE) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/library') {
    try {
      const data = await readBody(req);
      writeJSON(LIBRARY_FILE, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    }
    return;
  }

  // ---- Static file serving ----

  let filePath = urlPath === '/' ? '/OpeningAnalysis.html' : urlPath;
  filePath = path.join(ROOT, decodeURIComponent(filePath));
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Cabinet running at http://localhost:' + PORT);
});
