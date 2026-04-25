// Logs every API request and response to the terminal so failed feature
// calls (column color, board duplicate/rename, dblclick add column, admin
// delete, Trello import, etc.) are easy to spot.

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const GRAY   = '\x1b[90m';
const RESET  = '\x1b[0m';

function colorForStatus(status) {
  if (status >= 500) return RED;
  if (status >= 400) return YELLOW;
  if (status >= 300) return CYAN;
  return GREEN;
}

function tagForPath(method, path) {
  if (path.startsWith('/api/boards/import/trello')) return ' [TRELLO-IMPORT]';
  if (path.includes('/duplicate'))                  return ' [DUPLICATE]';
  if (method === 'PUT'    && path.startsWith('/api/columns/')) return ' [COLUMN-UPDATE]';
  if (method === 'PUT'    && /^\/api\/boards\/\d+$/.test(path)) return ' [BOARD-RENAME]';
  if (method === 'POST'   && path === '/api/columns')          return ' [COLUMN-CREATE]';
  if (method === 'DELETE' && path.startsWith('/api/columns/')) return ' [COLUMN-DELETE]';
  if (method === 'DELETE' && path.startsWith('/api/boards/'))  return ' [BOARD-DELETE]';
  if (method === 'DELETE' && path.startsWith('/api/tasks/'))   return ' [TASK-DELETE]';
  return '';
}

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;
    const color  = colorForStatus(status);
    const tag    = tagForPath(method, originalUrl);
    const user   = (req.user && (req.user.id || req.user.email)) || 'anon';
    console.log(
      `${GRAY}[${new Date().toISOString()}]${RESET} ` +
      `${method.padEnd(6)} ${originalUrl} ` +
      `${color}${status}${RESET} ${ms}ms ` +
      `${GRAY}user=${user}${RESET}${color}${tag}${RESET}`
    );
  });

  next();
};
