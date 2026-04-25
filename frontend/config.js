(function () {
  // Auto-detect API origin from current page hostname so the same code runs on
  // localhost, NAS LAN IP, or any reverse-proxy hostname without editing this file.
  // To override, set window.__API_ORIGIN__ before this script loads
  // (e.g. via a separate config.local.js).
  const explicit = (typeof window !== 'undefined' && window.__API_ORIGIN__) || null;
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
  const API_ORIGIN = explicit || `http://${host}:3000`;

  window.APP_CONFIG = {
    API_ORIGIN: API_ORIGIN,
    API_BASE: API_ORIGIN + '/api',
  };
  console.log('[config] API_ORIGIN =', API_ORIGIN);
})();
