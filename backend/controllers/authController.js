const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Login with username and password. Returns JWT token (expires 7 days).
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required', message: 'Please provide username and password' });
    }
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials', message: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({
      success: true,
      data: { user: { _id: user._id, name: user.name, username: user.username, role: user.role }, token },
      message: 'Login successful',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current logged-in user profile (requires JWT).
 */
const getProfile = async (req, res, next) => {
  try {
    res.json({ success: true, data: req.user, message: 'Profile retrieved' });
  } catch (error) {
    next(error);
  }
};

/**
 * Change current user password (requires JWT).
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password required', message: 'Please provide both passwords' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, error: 'Invalid password', message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, getProfile, changePassword };
