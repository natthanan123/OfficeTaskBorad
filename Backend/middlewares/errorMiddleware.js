const errorMiddleware = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return res.status(statusCode).json({ status: 'error', message });
};

module.exports = errorMiddleware;
