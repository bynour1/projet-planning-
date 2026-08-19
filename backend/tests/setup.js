// tests/setup.js — runs before every test file
process.env.NODE_ENV      = 'test';
process.env.JWT_SECRET    = 'test_jwt_secret_key_for_jest_2024';
process.env.DB_HOST       = '127.0.0.1';
process.env.DB_PORT       = '3306';
process.env.DB_NAME       = 'planning_test';
process.env.DB_USER       = 'root';
process.env.DB_PASS       = '';
process.env.EMAIL_USER    = '';   // disable emails in tests
process.env.EMAIL_PASS    = '';
process.env.FRONTEND_URL  = 'http://localhost:5173';
