import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import db, { initDatabase } from './db/database.js';
import { runSeeder } from './db/seed.js';
import { authRouter } from './routes/auth.js';
import { apiRouter, setBroadcastFn } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize Database & Auto-seed if empty
initDatabase();
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  console.log('🚀 Running initial database seeding...');
  await runSeeder();
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Static Files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Ensure upload, qr, proofs & faces directories exist
const uploadDir = path.join(__dirname, '../uploads');
const proofsDir = path.join(uploadDir, 'proofs');
const facesDir = path.join(uploadDir, 'faces');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
if (!fs.existsSync(facesDir)) fs.mkdirSync(facesDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true }));

// WebSocket for Real-time Dashboard & Live Broadcasts
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'WebSocket Live Stream Active' }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

setBroadcastFn(broadcast);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Fallback HTML page routes
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(publicDir, 'register.html')));
app.get('/audit', (req, res) => res.sendFile(path.join(publicDir, 'audit.html')));
app.get('/samples', (req, res) => res.sendFile(path.join(publicDir, 'samples.html')));
app.get('/models', (req, res) => res.sendFile(path.join(publicDir, 'models.html')));
app.get('/import', (req, res) => res.sendFile(path.join(publicDir, 'import.html')));
app.get('/screensaver', (req, res) => res.sendFile(path.join(publicDir, 'screensaver.html')));
app.get('/users', (req, res) => res.sendFile(path.join(publicDir, 'users.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start Server
server.listen(port, '0.0.0.0', () => {
  console.log(`
=============================================================
📱 SAMPLE MANAGEMENT SYSTEM (PE SOLUTION / SEIN-P)
🟢 Server running on: http://localhost:${port}
📊 Dashboard & Scan: http://localhost:${port}/
🔍 Audit Module:     http://localhost:${port}/audit
📦 Sample Database:  http://localhost:${port}/samples
📥 Bulk Ingestion:   http://localhost:${port}/import
🖥️ Live Screensaver: http://localhost:${port}/screensaver
👥 User Management:  http://localhost:${port}/users
=============================================================
  `);
});
