const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ─── Multer config ────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext    = path.extname(file.originalname);
    const base   = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,40);
    const unique = `${Date.now()}-${Math.round(Math.random()*1e6)}`;
    cb(null, `${base}_${unique}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
  'audio/webm','audio/ogg','audio/mp3','audio/mpeg','audio/wav','audio/mp4','audio/m4a','audio/aac','audio/x-m4a',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','text/csv',
];

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_TYPES.includes(file.mimetype) ? cb(null,true) : cb(new Error('Type de fichier non autorisé'));
  },
});

function fileIcon(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/'))  return '🖼';
  if (mime.startsWith('audio/'))  return '🎙️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word'))      return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  if (mime.includes('text'))      return '📃';
  return '📎';
}

function firstRow(r) { return Array.isArray(r) ? r[0]||null : r||null; }

// GET /api/chat/messages
router.get('/messages', authenticate, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  try {
    const [rows] = await db.query('SELECT * FROM messages ORDER BY created_at ASC LIMIT ?', [limit]);
    res.json(Array.isArray(rows) ? rows : []);
  } catch { res.status(500).json({ message:'Erreur serveur' }); }
});

// POST /api/chat/messages (REST fallback)
router.post('/messages', authenticate, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ message:'Message vide' });
  try {
    const [result] = await db.query(
      'INSERT INTO messages (user_id,nom,role,content) VALUES (?,?,?,?)',
      [req.user.id, `${req.user.prenom} ${req.user.nom}`, req.user.role, content.trim()]
    );
    const [rows] = await db.query('SELECT * FROM messages WHERE id=?', [result.insertId]);
    const msg = firstRow(rows);
    const io = req.app.get('io');
    if (io) io.emit('new_message', msg);
    res.status(201).json(msg);
  } catch { res.status(500).json({ message:'Erreur serveur' }); }
});

// POST /api/chat/upload
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message:'Fichier manquant' });
  try {
    const { originalname, filename, mimetype, size } = req.file;
    const content = JSON.stringify({
      type:'file', filename, originalname, mimetype, size,
      sizeDisplay: `${(size/1024).toFixed(1)} Ko`,
      icon: fileIcon(mimetype),
      url: `/api/chat/files/${filename}`,
    });
    const [result] = await db.query(
      "INSERT INTO messages (user_id,nom,role,content,type) VALUES (?,?,?,?,'file')",
      [req.user.id, `${req.user.prenom} ${req.user.nom}`, req.user.role, content]
    );
    const [rows] = await db.query('SELECT * FROM messages WHERE id=?', [result.insertId]);
    const msg = firstRow(rows);
    const io = req.app.get('io');
    if (io) io.emit('new_message', msg);
    res.status(201).json(msg);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message:"Erreur lors de l'upload" });
  }
});

// GET /api/chat/files/:filename
router.get('/files/:filename', authenticate, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return res.status(403).json({ message:'Accès refusé' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ message:'Fichier introuvable' });
  res.sendFile(resolved);
});

// DELETE /api/chat/messages/:id
router.delete('/messages/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM messages WHERE id=?', [req.params.id]);
    const msg = firstRow(rows);
    if (!msg) return res.status(404).json({ message:'Message introuvable' });
    if (msg.user_id !== req.user.id && req.user.role !== 'administrateur')
      return res.status(403).json({ message:'Accès refusé' });
    if (msg.type === 'file') {
      try { const d=JSON.parse(msg.content); const fp=path.join(UPLOADS_DIR,d.filename); if(fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    await db.query('DELETE FROM messages WHERE id=?', [req.params.id]);
    res.json({ message:'Message supprimé' });
  } catch { res.status(500).json({ message:'Erreur serveur' }); }
});

// Multer error
router.use((err,_req,res,_next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message:'Fichier trop volumineux (max 10 Mo)' });
  if (err) return res.status(400).json({ message: err.message });
});

module.exports = router;
