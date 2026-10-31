// middleware/errorHandler.js
function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Resource not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, message: 'This record already exists.' });
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.publicMessage || 'Something went wrong on the server. Please try again.'
  });
}

module.exports = { notFound, errorHandler };
