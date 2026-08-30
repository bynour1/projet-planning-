// app.js  — Express app WITHOUT server.listen() so Supertest can bind its own port
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock io so routes that do req.app.get('io') don't crash
app.set('io', { emit: () => {} });

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/auth',        require('./routes/reset'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/planning',    require('./routes/planning'));
app.use('/api/events',      require('./routes/events'));
app.use('/api/clino',       require('./routes/clino'));
app.use('/api/chat',        require('./routes/chat'));
app.use('/api/routines',    require('./routes/routines'));
app.use('/api/entreprises', require('./routes/entreprises'));
app.use('/api/stats',       require('./routes/stats'));
app.use('/api/search',      require('./routes/search'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ message: 'Route introuvable' }));

module.exports = app;
