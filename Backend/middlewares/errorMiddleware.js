const errorMiddleware = (err, req, res, _next) => {
  const user = (req.user && (req.user.id || req.user.email)) || 'anon';
  console.error(
    `\x1b[31m[ERROR]\x1b[0m ${req.method} ${req.originalUrl} user=${user}`
  );
  console.error(err.stack || err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return res.status(statusCode).json({ status: 'error', message });
};

module.exports = errorMiddleware;
