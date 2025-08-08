// src/middleware/errorHandler.js

/**
 * Global error handler.
 * Catches thrown errors and sends appropriate JSON responses.
 */
module.exports = (err, req, res, next) => {
  console.error(err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Conflict error',
      field: err.errors[0].path,
      message: err.errors[0].message
    });
  }

  // Custom thrown errors with status
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Fallback
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
};
