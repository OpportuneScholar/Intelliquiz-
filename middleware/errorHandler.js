function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Resource not found.' });
}
function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  if (err && (err.code === 11000 || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
    return res.status(409).json({ success: false, message: 'This record already exists.' });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid record identifier.' });
  }
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.publicMessage || 'Something went wrong on the server. Please try again.' });
}
module.exports = { notFound, errorHandler };
