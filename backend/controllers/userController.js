const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogService');

const SALT_ROUNDS = 12;

/**
 * Get all users (password excluded).
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new user. Admin only.
 */
const createUser = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, username, password and role are required' });
    }
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new User({
      name,
      username: username.toLowerCase(),
      password: hashedPassword,
      role,
      createdBy: req.user.name,
    });
    user.$locals.skipPasswordHash = true;
    await user.save();

    const { password: _pw, ...userWithoutPassword } = user.toObject();
    await logActivity({
      req,
      action: 'CREATE',
      module: 'User',
      description: `Created user ${user.name} (${user.username})`,
      documentId: user._id,
      newValue: userWithoutPassword,
    });
    res.status(201).json({ success: true, data: userWithoutPassword, message: 'User created successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a user's profile fields. Admin only.
 * Prevents self-demotion (role change) and self-deactivation.
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, username, role, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isSelf = String(user._id) === String(req.user._id);
    if (isSelf && role && role !== user.role) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }
    if (isSelf && isActive === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    if (username && username.toLowerCase() !== user.username) {
      const existing = await User.findOne({ username: username.toLowerCase(), _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
      user.username = username.toLowerCase();
    }
    if (name !== undefined) user.name = name;
    if (role !== undefined && !isSelf) user.role = role;
    if (isActive !== undefined && !(isSelf && isActive === false)) user.isActive = isActive;

    await user.save();

    const { password: _pw, ...userWithoutPassword } = user.toObject();
    await logActivity({
      req,
      action: 'UPDATE',
      module: 'User',
      description: `Updated user ${user.name} (${user.username})`,
      documentId: user._id,
      newValue: userWithoutPassword,
    });
    res.json({ success: true, data: userWithoutPassword, message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset a user's password. Admin only.
 */
const adminResetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.$locals.skipPasswordHash = true;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await logActivity({
      req,
      action: 'RESET_PASSWORD',
      module: 'User',
      description: `Admin ${req.user.name} reset password for ${user.name}`,
      documentId: user._id,
    });
    res.json({ success: true, message: 'Password reset' });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft-delete (deactivate) a user. Admin only.
 * Prevents self-deletion and deleting the last remaining admin.
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    if (user.role === 'admin') {
      const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (activeAdminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last admin' });
      }
    }
    user.isActive = false;
    await user.save();
    await logActivity({
      req,
      action: 'DELETE',
      module: 'User',
      description: `Deactivated user ${user.name} (${user.username})`,
      documentId: user._id,
      previousValue: { name: user.name, username: user.username, role: user.role },
    });
    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Aggregate user stats for the dashboard cards.
 */
const getUserStats = async (req, res, next) => {
  try {
    const [totalUsers, totalAdmins, totalViewers, activeUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'viewer' }),
      User.countDocuments({ isActive: true }),
    ]);
    res.json({ success: true, data: { totalUsers, totalAdmins, totalViewers, activeUsers } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  adminResetPassword,
  deleteUser,
  getUserStats,
};
