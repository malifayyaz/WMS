const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogService');

/**
 * Login with username and password. Returns JWT token.
 * Enforces login attempt lockout after 5 failed attempts (5-minute lock).
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required', message: 'Please provide username and password' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockUntil - new Date()) / 60000
      );
      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${minutesLeft} minute(s).`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 min
        user.loginAttempts = 0;
        await user.save();
        return res.status(423).json({
          success: false,
          message: 'Too many failed attempts. Account locked for 5 minutes.',
        });
      }
      await user.save();
      const attemptsLeft = 5 - user.loginAttempts;
      return res.status(401).json({
        success: false,
        message: `Invalid password. ${attemptsLeft} attempt(s) remaining.`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    // Attach user so logActivity can resolve identity (login has no JWT yet)
    req.user = user;
    await logActivity({
      req,
      action: 'LOGIN',
      module: 'Auth',
      description: `${user.name} logged in`,
      documentId: user._id,
    });

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
