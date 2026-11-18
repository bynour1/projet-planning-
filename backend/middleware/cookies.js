/**
 * Middleware léger et autonome de parsing des cookies HTTP.
 * Ne dépend d'aucun package externe. Remplit req.cookies avec les paires clé=valeur.
 */
function cookieParser(req, _res, next) {
  req.cookies = req.cookies || {};
  const raw = req.headers.cookie;
  if (!raw) return next();

  const pairs = raw.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        req.cookies[key] = decodeURIComponent(val);
      } catch {
        req.cookies[key] = val;
      }
    }
  }
  next();
}

module.exports = cookieParser;
