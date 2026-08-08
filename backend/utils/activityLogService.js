const ActivityLog = require('../models/ActivityLog');

/**
 * Persist an activity log entry. Never throws — logging must not break main ops.
 */
async function logActivity({
  req,
  action,
  module,
  description,
  documentId,
  previousValue,
  newValue,
}) {
  try {
    await ActivityLog.create({
      userId: req.user?._id,
      userName: req.user?.name || 'System',
      userRole: req.user?.role || 'system',
      action,
      module,
      description,
      documentId: documentId != null ? String(documentId) : undefined,
      previousValue,
      newValue,
      ipAddress: req.ip || req.connection?.remoteAddress,
    });
  } catch (e) {
    console.error('Activity log failed:', e.message);
  }
}

module.exports = { logActivity };
