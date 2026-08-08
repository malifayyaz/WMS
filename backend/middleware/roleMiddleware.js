/**
 * Role-based access control middleware. Must run after authMiddleware
 * (relies on req.user being populated with the full user document).
 */

/**
 * Allows the request through only if the logged-in user is an admin.
 */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.',
    });
  }
  next();
};

/**
 * Blocks viewers from performing write actions. Any other role passes through.
 */
const blockViewer = (req, res, next) => {
  if (req.user?.role === 'viewer') {
    return res.status(403).json({
      success: false,
      message: 'Viewers cannot perform this action.',
    });
  }
  next();
};

module.exports = { adminOnly, blockViewer };
