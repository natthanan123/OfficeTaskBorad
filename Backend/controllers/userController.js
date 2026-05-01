const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const { Op } = require('sequelize');
const { User } = require('../models');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    const user = await User.create({
      email,
      password_hash: password,
      full_name,
      avatar_url,
      role,
    });

    const safeUser = await User.findByPk(user.id);

    return res.status(201).json({ status: 'success', data: { user: safeUser } });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'email and password are required' });
    }

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user || !(await user.validatePassword(password))) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    const safeUser = await User.findByPk(user.id);

    return res.json({ status: 'success', data: { token, user: safeUser } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No image file provided' });
    }

    const avatar_url = `/uploads/avatars/${req.file.filename}`;

    await req.user.update({ avatar_url });

    return res.json({ status: 'success', data: { avatar_url } });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not upload avatar' });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No image file provided' });
    }

    const profile_picture = `/uploads/avatars/${req.file.filename}`;

    await req.user.update({ profile_picture });

    return res.json({ status: 'success', data: { profile_picture } });
  } catch (err) {
    console.error('updateAvatar error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update avatar' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'email is required' });
    }

    const successResponse = {
      status: 'success',
      message: 'If this email is registered, a reset link has been sent.',
    };

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user) {
      return res.json(successResponse);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: resetExpiry,
    });

    // Reset link points to the LAN/NAS frontend (override via FRONTEND_URL env)
    const frontendBase = process.env.FRONTEND_URL || 'http://192.168.1.135:5500';
    const resetLink = `${frontendBase}/ResetPassword_Page/code.html?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Pawtry Workspace" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your Password - Pawtry',
      text: `Click this link to reset your password: ${resetLink}\n\nThis link will expire in 1 hour.\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#3525cd;">Reset Your Password</h2>
          <p>Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#3525cd;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;">Reset Password</a>
          <p style="color:#777;font-size:12px;margin-top:24px;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.json(successResponse);
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not process forgot password request' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({ status: 'error', message: 'token and new_password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
    }

    const user = await User.scope('withPassword').findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token' });
    }

    user.password_hash = new_password;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    return res.json({ status: 'success', message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not reset password' });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ status: 'error', message: 'credential is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload || {};

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Google account has no email' });
    }

    let user = await User.scope('withPassword').findOne({ where: { email } });

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        email,
        password_hash: randomPassword,
        full_name: name || email.split('@')[0],
        avatar_url: picture || null,
      });
    }

    const token = signToken(user.id);
    const safeUser = await User.findByPk(user.id);

    return res.json({ status: 'success', data: { token, user: safeUser } });
  } catch (err) {
    console.error('googleLogin error:', err);
    return res.status(401).json({ status: 'error', message: 'Google sign-in failed' });
  }
};

exports.getMe = async (req, res) => {
  try {
    return res.json({ status: 'success', data: { user: req.user } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Could not fetch profile' });
  }
};

//Update profile (full_name)
exports.updateMe = async (req, res) => {
  try {
    const { full_name } = req.body || {};
    const updates = {};
    if (typeof full_name === 'string') {
      const trimmed = full_name.trim();
      if (!trimmed) {
        return res.status(400).json({ status: 'error', message: 'full_name cannot be empty' });
      }
      updates.full_name = trimmed;
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    }

    await req.user.update(updates);
    const safeUser = await User.findByPk(req.user.id);
    return res.json({ status: 'success', data: { user: safeUser } });
  } catch (err) {
    console.error('updateMe error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update profile' });
  }
};
