// app.js  — Express app WITHOUT server.listen() so Supertest can bind its own port
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cookieParser = require('./middleware/cookies');
const app     = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 🔒 SÉCURITÉ : Suppression du dossier statique public sur /uploads
app.use('/uploads', (req, res) => {
  if (req.path.startsWith('/avatars/')) {
    const filename = path.basename(req.path);
    return res.redirect(302, `/api/auth/avatar/${filename}`);
  }
  return res.status(401).json({
    message: 'Accès non autorisé : l\'accès direct aux fichiers téléversés est interdit. Veuillez utiliser les routes sécurisées ou une URL signée.',
  });
});

// Mock io so routes that do req.app.get('io') don't crash
app.set('io', { emit: () => {} });

// ─── Documentation Swagger / OpenAPI ───────────────────────────
const { setupSwagger } = require('./config/swagger');
setupSwagger(app);

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/planning',    require('./routes/planning'));
app.use('/api/events',      require('./routes/events'));
app.use('/api/clino',       require('./routes/clino'));
app.use('/api/chat',        require('./routes/chat'));
app.use('/api/routines',    require('./routes/routines'));
app.use('/api/entreprises', require('./routes/entreprises'));
app.use('/api/documents',   require('./routes/documents'));
app.use('/api/stats',       require('./routes/stats'));
app.use('/api/search',      require('./routes/search'));
app.use('/api/push',        require('./routes/push'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ message: 'Route introuvable' }));

module.exports = app;
