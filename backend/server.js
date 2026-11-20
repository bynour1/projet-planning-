const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { verifyTotpEnvironment } = require('./utils/totp');
verifyTotpEnvironment();
const { validateMailerConfig } = require('./config/mailer');
try { validateMailerConfig(); } catch (e) { if (process.env.NODE_ENV === 'production') throw e; }
const { validateWebAuthnConfig } = require('./config/webauthn');
try { validateWebAuthnConfig(); } catch (e) { if (process.env.NODE_ENV === 'production') throw e; }
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
    return callback(new Error('Origine non autorisée par la politique CORS'));
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
    if (socket.user.is_2fa_temp) {
      return next(new Error('Authentication error: complete session token required'));
    }
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Connected users map  { socketId → user }
const connectedUsers = new Map();

function getUniqueOnlineUsers() {
  const map = new Map();
  for (const u of connectedUsers.values()) {
    if (u?.id) {
      map.set(u.id, u);
    }
  }
  return Array.from(map.values());
}

io.on('connection', (socket) => {
  const user = socket.user;
  connectedUsers.set(socket.id, {
    id:     user.id,
    nom:    user.nom,
    prenom: user.prenom,
    role:   user.role,
  });

  // Broadcast updated online list (dédupliquée par utilisateur)
  io.emit('users_online', getUniqueOnlineUsers());

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

      // Push notification aux autres utilisateurs (zéro fuite de données médicales ou patient)
      try {
        const pushService = require('./services/pushService');
        const [subs] = await db.query('SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id != ?', [user.id]);
        if (subs?.length) {
          pushService.sendPushToMultipleUsers(subs.map(s => s.user_id), {
            title: 'Nouveau message',
            body: 'Vous avez reçu un nouveau message.',
            data: { url: '/chat' },
          }).catch(() => {});
        }
      } catch {}
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
    io.emit('users_online', getUniqueOnlineUsers());
  });
});

// Expose io to routes if needed
app.set('io', io);

// Faire confiance au reverse proxy (Render / Nginx / Cloudflare) pour l'IP client et rate limiting
app.set('trust proxy', 1);

// ─── Express Middleware ───────────────────────────────────────
const compression = require('compression');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const cookieParser = require('./middleware/cookies');

app.use(compression({
  threshold: 1024,
  level: 6,
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors(corsOptions));
app.use(cookieParser);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.set('trust proxy', 1);

// Anti brute-force rate limiter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Trop de requêtes, veuillez patienter 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/verify-2fa', authLimiter);

// Limiteur général d'API pour protection contre le déni de service (DDoS)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { message: 'Seuil de requêtes API atteint. Veuillez patienter.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 🔒 SÉCURITÉ : Suppression du dossier statique public sur /uploads
// Tout accès direct sans authentification est interdit (accès via route authentifiée ou URL signée de 5 minutes)
app.use('/uploads', (req, res) => {
  // Redirection des anciens chemins d'avatars vers la route dédiée
  if (req.path.startsWith('/avatars/')) {
    const filename = path.basename(req.path);
    return res.redirect(302, `/api/auth/avatar/${filename}`);
  }
  return res.status(401).json({
    message: 'Accès non autorisé : l\'accès direct aux fichiers téléversés est interdit. Veuillez utiliser les routes d\'accès sécurisées ou une URL signée.',
  });
});

// ─── Documentation Swagger / OpenAPI ───────────────────────────
const { setupSwagger } = require('./config/swagger');
setupSwagger(app);

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/planning',    require('./routes/planning'));
app.use('/api/events',      require('./routes/events'));
app.use('/api/clino',       require('./routes/clino'));
app.use('/api/chat',        require('./routes/chat'));
app.use('/api/routines',    require('./routes/routines'));
app.use('/api/entreprises', require('./routes/entreprises'));
app.use('/api/documents',   require('./routes/documents'));

app.use('/api/stats', require('./routes/stats'));
app.use('/api/search', require('./routes/search'));
app.use('/api/push',   require('./routes/push'));

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

// ─── Ensure schema migrations ───────────────────────────────
db.query('ALTER TABLE clino_mobile MODIFY COLUMN heure TIME NULL DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE users ADD COLUMN token_version INT DEFAULT 1').catch(() => {});
db.query('ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL').catch(() => {});
db.query('ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL').catch(() => {});
db.query(`CREATE TABLE IF NOT EXISTS trusted_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_trusted_user (user_id),
  INDEX idx_trusted_token_hash (token_hash)
)`).catch(() => {});
db.query(`CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  trusted_device_id INT NULL,
  is_trusted TINYINT(1) DEFAULT 0,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL DEFAULT NULL,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_token_hash (token_hash)
)`).catch(() => {});
db.query('ALTER TABLE planning_events ADD COLUMN statut VARCHAR(30) DEFAULT \'confirme\'').catch(() => {});
db.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash VARCHAR(64) NOT NULL UNIQUE,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_push_at DATETIME NULL DEFAULT NULL,
  INDEX idx_push_user (user_id),
  INDEX idx_push_endpoint_hash (endpoint_hash)
)`).catch(() => {});
db.query(`CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id VARCHAR(255) PRIMARY KEY,
  user_id INT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(150) NULL,
  transports VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  INDEX idx_webauthn_user (user_id)
)`).catch(() => {});
// Invalidation des anciens identifiants biométriques non sécurisés
db.query('UPDATE users SET biometric_credential = NULL WHERE biometric_credential IS NOT NULL').catch(() => {});

// ─── Start Reminders ──────────────────────────────────────────
require('./cron/reminders')(db);

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 8083;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏥  Planning Médical — API démarrée`);
  console.log(`📡  http://localhost:${PORT} & réseau local (0.0.0.0:${PORT})`);
  console.log(`🔌  Socket.IO actif\n`);
});
