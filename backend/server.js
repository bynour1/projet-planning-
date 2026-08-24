require('dotenv').config();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const { Server } = require('socket.io');
const jwt       = require('jsonwebtoken');
const db        = require('./config/db');

const app    = express();
const server = http.createServer(app);

// ─── CORS configuration ─────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server) or in whitelist
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
};

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
});

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Connected users map  { socketId → user }
const connectedUsers = new Map();

io.on('connection', (socket) => {
  const user = socket.user;
  connectedUsers.set(socket.id, {
    id:     user.id,
    nom:    user.nom,
    prenom: user.prenom,
    role:   user.role,
  });

  // Broadcast updated online list
  io.emit('users_online', Array.from(connectedUsers.values()));

  // ── send_message ───────────────────────────────────────────
  socket.on('send_message', async (data) => {
    const content = typeof data === 'string' ? data.trim() : data?.content?.trim();
    if (!content) return;
    const type = data?.type || 'text';
    try {
      const [result] = await db.query(
        'INSERT INTO messages (user_id, nom, role, content, type) VALUES (?,?,?,?,?)',
        [user.id, `${user.prenom} ${user.nom}`, user.role, content, type]
      );
      const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
      io.emit('new_message', rows[0]);
    } catch (err) {
      console.error('Socket send_message error:', err.message);
    }
  });

  // ── delete_message ─────────────────────────────────────────
  socket.on('delete_message', async (messageId) => {
    try {
      const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!rows[0]) return;
      if (rows[0].user_id !== user.id && user.role !== 'administrateur') return;
      await db.query('DELETE FROM messages WHERE id = ?', [messageId]);
      io.emit('message_deleted', messageId);
    } catch (err) {
      console.error('Socket delete_message error:', err.message);
    }
  });

  // ── typing ─────────────────────────────────────────────────
  socket.on('typing', (isTyping) => {
    socket.broadcast.emit('user_typing', {
      userId: user.id,
      nom:    `${user.prenom} ${user.nom}`,
      isTyping,
    });
  });

  // ── planning_updated ───────────────────────────────────────
  socket.on('planning_updated', () => {
    socket.broadcast.emit('planning_refresh');
  });

  // ── calendar_updated ───────────────────────────────────────
  socket.on('calendar_updated', () => {
    socket.broadcast.emit('calendar_refresh');
  });

  // ── disconnect ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    io.emit('users_online', Array.from(connectedUsers.values()));
  });
});

// Expose io to routes if needed
app.set('io', io);

// ─── Express Middleware ───────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/auth',     require('./routes/reset'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/planning', require('./routes/planning'));
app.use('/api/events',   require('./routes/events'));
app.use('/api/clino',    require('./routes/clino'));
app.use('/api/chat',        require('./routes/chat'));
app.use('/api/routines',    require('./routes/routines'));
app.use('/api/entreprises', require('./routes/entreprises'));

app.use('/api/stats', require('./routes/stats'));
app.use('/api/search', require('./routes/search'));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// 404
app.use((_req, res) => res.status(404).json({ message: 'Route introuvable' }));

// Global Express error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Une erreur interne est survenue sur le serveur.',
  });
});

// Process-level safety handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// ─── Start Reminders ──────────────────────────────────────────
require('./cron/reminders')(db);

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 8083;
server.listen(PORT, () => {
  console.log(`\n🏥  Planning Médical — API démarrée`);
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🔌  Socket.IO actif\n`);
});
