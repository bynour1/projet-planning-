const mysql = require('mysql2/promise');
require('dotenv').config();

let poolConfig = {
  waitForConnections:    true,
  connectionLimit:       15,
  maxIdle:               10,
  idleTimeout:           60000,
  queueLimit:            0,
  timezone:              '+00:00',
  enableKeepAlive:       true,
  keepAliveInitialDelay: 5000,
  connectTimeout:        10000,
};

if (process.env.DATABASE_URL) {
  poolConfig.uri = process.env.DATABASE_URL;
  poolConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: false };
} else {
  poolConfig.host     = process.env.DB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com';
  poolConfig.port     = parseInt(process.env.DB_PORT) || 4000;
  poolConfig.database = process.env.DB_NAME || 'planning';
  poolConfig.user     = process.env.DB_USER || '3ZJmDLdz1RQ9uBv.root';
  poolConfig.password = process.env.DB_PASS || 'WgGV6NAYhXEF5rzT';
  poolConfig.ssl      = { minVersion: 'TLSv1.2', rejectUnauthorized: false };
}

const pool = mysql.createPool(poolConfig);

// Periodically ping DB to keep remote cloud connection warm and healthy
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('DB Keepalive Ping Error:', err.message);
  }
}, 25000);

module.exports = pool;


