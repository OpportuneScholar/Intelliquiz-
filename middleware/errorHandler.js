function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Resource not found.' });
}

function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err && (err.code === 11000 || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
    return res.status(409).json({ success: false, message: 'This record already exists.' });
  }
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).json({
      success: false,
      message: err.name === 'CastError' ? 'Invalid record identifier.' : err.message
    });
  }
  if (err && err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Image is too large. Maximum allowed size is 3 MB.'
      : 'The uploaded image could not be processed.';
    return res.status(400).json({ success: false, message });
  }
  if (err && /Only image files are allowed/.test(err.message || '')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }

  const status = Number(err && err.status) || 500;
  res.status(status).json({
    success: false,
    message: status < 500 && err.publicMessage
      ? err.publicMessage
      : 'Something went wrong on the server. Please try again.'
  });
}

module.exports = { notFound, errorHandler };
