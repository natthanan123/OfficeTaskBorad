const jwt = require('jsonwebtoken');
const { User } = require('../models');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── POST /register ───
exports.register = async (req, res) => {
  try {
    const { email, password, full_name, avatar_url, role } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ status: 'error', message: 'email, password, and full_name are required' });
    }

    const existing = await User.scope('withPassword').findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'Email already in use' });
    }

    // password is stored in password_hash; the beforeCreate hook hashes it automatically
    const user = await User.create({
      email,
      password_hash: password,
      full_name,
      avatar_url,
      role,
    });

    // Re-fetch without password_hash (default scope excludes it)
    const safeUser = await User.findByPk(user.id);

    return res.status(201).json({ status: 'success', data: { user: safeUser } });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
};

// ─── POST /login ───
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'email and password are required' });
    }

    // Need the hash to validate — use withPassword scope
    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user || !(await user.validatePassword(password))) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    const token = signToken(user.id);

    // Return user without password_hash
    const safeUser = await User.findByPk(user.id);

    return res.json({ status: 'success', data: { token, user: safeUser } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
};

// ─── POST /avatar ── Upload profile picture ───
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No image file provided' });
    }

    // Build a public URL path for the uploaded file
    const avatar_url = `/uploads/avatars/${req.file.filename}`;

    await req.user.update({ avatar_url });

    return res.json({ status: 'success', data: { avatar_url } });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not upload avatar' });
  }
};

// ─── GET /me ───
exports.getMe = async (req, res) => {
  try {
    return res.json({ status: 'success', data: { user: req.user } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Could not fetch profile' });
  }
};
