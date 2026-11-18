const crypto = require('crypto');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';       // Excludes I, O
const LOWER = 'abcdefghijkmnopqrstuvwxyz';       // Excludes l, o
const DIGITS = '23456789';                       // Excludes 0, 1
const SYMBOLS = '!@#$%*-_+=?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/**
 * Génère un mot de passe temporaire cryptographiquement sécurisé de 14 caractères.
 * - Utilise crypto.randomInt
 * - Mélange majuscules, minuscules, chiffres, symboles
 * - Sans caractères ambigus (0, O, o, l, 1, I)
 */
function generateTempPassword(length = 14) {
  if (length < 8) length = 14;

  // Garantir au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 symbole
  const pwdChars = [
    UPPER[crypto.randomInt(0, UPPER.length)],
    LOWER[crypto.randomInt(0, LOWER.length)],
    DIGITS[crypto.randomInt(0, DIGITS.length)],
    SYMBOLS[crypto.randomInt(0, SYMBOLS.length)],
  ];

  // Compléter jusqu'à la longueur requise
  for (let i = pwdChars.length; i < length; i++) {
    pwdChars.push(ALL[crypto.randomInt(0, ALL.length)]);
  }

  // Mélange Fisher-Yates sécurisé avec crypto.randomInt
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = pwdChars[i];
    pwdChars[i] = pwdChars[j];
    pwdChars[j] = temp;
  }

  return pwdChars.join('');
}

module.exports = {
  generateTempPassword,
  UPPER,
  LOWER,
  DIGITS,
  SYMBOLS,
};
