require('dotenv').config();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const { Server } = require('socket.io');
const jwt       = require('jsonwebtoken');
const db        = require('./config/db');

const app    = express();
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
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
    const content = data?.content?.trim();
    if (!content) return;
    try {
      const [result] = await db.query(
        'INSERT INTO messages (user_id, nom, role, content) VALUES (?,?,?,?)',
        [user.id, `${user.prenom} ${user.nom}`, user.role, content]
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
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
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

// ─── Start Reminders ──────────────────────────────────────────
require('./cron/reminders')(db);

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 8083;
server.listen(PORT, () => {
  console.log(`\n🏥  Planning Médical — API démarrée`);
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🔌  Socket.IO actif\n`);
});
