const mysql = require('mysql2/promise');
require('dotenv').config();

let poolConfig = {
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
};

if (process.env.DATABASE_URL) {
  poolConfig.uri = process.env.DATABASE_URL;
  if (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host     = process.env.DB_HOST || '127.0.0.1';
  poolConfig.port     = parseInt(process.env.DB_PORT) || 3306;
  poolConfig.database = process.env.DB_NAME || 'planning';
  poolConfig.user     = process.env.DB_USER || 'root';
  poolConfig.password = process.env.DB_PASS || '';
  if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;

