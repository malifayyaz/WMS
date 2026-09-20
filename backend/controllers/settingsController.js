const SystemSettings = require('../models/SystemSettings');

// Default seed values
const defaultSettings = [
  {
    key: 'wastePercentage',
    value: 5,
    description: 'Percentage of cost of wire sold deducted as manufacturing waste',
  }
];

/**
 * GET /api/settings
 * Fetch all settings as a key-value object. Auto-seeds if empty.
 */
exports.getSettings = async (req, res, next) => {
  try {
    const settings = await SystemSettings.find();
    
    // Auto-seed if needed
    if (settings.length === 0) {
      await SystemSettings.insertMany(defaultSettings);
      const seeded = await SystemSettings.find();
      const settingsObj = seeded.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      return res.json({ success: true, data: settingsObj });
    }

    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings/:key
 * Update a specific setting. Only Admin can update.
 */
exports.updateSetting = async (req, res, next) => {
  try {
    // Check if admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
    }

    const { key } = req.params;
    const { value } = req.body;

    let setting = await SystemSettings.findOne({ key });
    if (!setting) {
      // Create if it doesn't exist
      setting = new SystemSettings({
        key,
        value,
        description: `Setting for ${key}`,
        updatedBy: req.user.username || req.user.name || 'Admin',
      });
    } else {
      setting.value = value;
      setting.updatedBy = req.user.username || req.user.name || 'Admin';
    }

    await setting.save();
    
    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    if (ActivityLog) {
      await ActivityLog.create({
        user: req.user.id || req.user._id,
        userName: req.user.username || req.user.name,
        action: 'UPDATE',
        entityType: 'SystemSettings',
        entityId: setting._id,
        details: `Updated setting ${key} to ${value}`,
      }).catch(err => console.error('Failed to log activity for settings update:', err));
    }

    res.json({ success: true, data: setting, message: 'Setting updated successfully' });
  } catch (error) {
    next(error);
  }
};
