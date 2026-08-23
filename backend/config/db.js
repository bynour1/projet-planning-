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

module.exports = pool;


