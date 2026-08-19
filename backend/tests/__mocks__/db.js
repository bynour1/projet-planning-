// tests/__mocks__/db.js
// Jest auto-mock replacement for config/db.js
// Each test file can override these defaults via jest.spyOn or mockResolvedValueOnce

const db = {
  query: jest.fn(),
};

// Sensible defaults — tests can override per-call
db.query.mockResolvedValue([[],{}]);

module.exports = db;
