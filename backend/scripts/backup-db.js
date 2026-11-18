const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function createBackup() {
  console.log('[Backup DB] Démarrage de la sauvegarde de la base de données...');
  const conn = await pool.getConnection();
  try {
    const [tablesRows] = await conn.query('SHOW TABLES');
    const tables = tablesRows.map(r => Object.values(r)[0]);

    let dump = `-- ================================================================\n`;
    dump += `-- Sauvegarde automatique base Planning Médical\n`;
    dump += `-- Date : ${new Date().toISOString()}\n`;
    dump += `-- ================================================================\n\n`;
    dump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (const table of tables) {
      // CREATE TABLE
      const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      dump += `-- Structure de la table \`${table}\`\n`;
      dump += `DROP TABLE IF EXISTS \`${table}\`;\n`;
      dump += `${createRow['Create Table']};\n\n`;

      // DATA
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      if (rows.length > 0) {
        dump += `-- Données de la table \`${table}\` (${rows.length} lignes)\n`;
        for (const row of rows) {
          const keys = Object.keys(row).map(k => `\`${k}\``).join(', ');
          const values = Object.values(row).map(v => {
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
          }).join(', ');
          dump += `INSERT INTO \`${table}\` (${keys}) VALUES (${values});\n`;
        }
        dump += `\n`;
      }
    }

    dump += `SET FOREIGN_KEY_CHECKS = 1;\n`;

    const backupDir = path.join(__dirname, '../../database');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, 'sauvegarde_planning.sql');
    fs.writeFileSync(backupPath, dump, 'utf8');

    console.log(`[Backup DB] Sauvegarde réussie avec succès !`);
    console.log(`[Backup DB] Fichier créé : ${backupPath}`);
  } catch (err) {
    console.error('[Backup DB] Erreur lors de la sauvegarde :', err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

createBackup();
