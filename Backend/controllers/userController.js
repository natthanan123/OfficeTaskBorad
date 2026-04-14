const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { User } = require('../models');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /register
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

    // Plain password goes into password_hash; the beforeCreate hook hashes it.
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

// POST /login
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

// POST /avatar — multipart upload handled by multer middleware.
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

// POST /forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'email is required' });
    }

    // Always return success to avoid email enumeration.
    const successResponse = {
      status: 'success',
      message: 'If this email is registered, a reset link has been sent.',
    };

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user) {
      return res.json(successResponse);
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await user.update({
      reset_token: resetToken,
      reset_token_expiry: resetExpiry,
    });

    const frontendBase = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';
    const resetLink = `${frontendBase}/frontend/ResetPassword_Page/code.html?token=${resetToken}`;

    console.log('─────────────────────────────────────────');
    console.log('🔑 Password Reset Link (dev):');
    console.log(resetLink);
    console.log('─────────────────────────────────────────');

    try {
      const testAccount = await nodemailer.createTestAccount();

      const transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      const info = await transporter.sendMail({
        from: '"Pawtry Workspace" <noreply@pawtry.dev>',
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

      console.log('📧 Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (mailErr) {
      // Non-blocking: reset row is already written, user can still use the dev log.
      console.error('Nodemailer error (non-blocking):', mailErr.message);
    }

    return res.json(successResponse);
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not process forgot password request' });
  }
};

// POST /reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({ status: 'error', message: 'token and new_password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
    }

    const { Op } = require('sequelize');
    const user = await User.scope('withPassword').findOne({
      where: {
        reset_token: token,
        reset_token_expiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token' });
    }

    // beforeUpdate hook rehashes password_hash on save.
    user.password_hash = new_password;
    user.reset_token = null;
    user.reset_token_expiry = null;
    await user.save();

    return res.json({ status: 'success', message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not reset password' });
  }
};

// GET /me
exports.getMe = async (req, res) => {
  try {
    return res.json({ status: 'success', data: { user: req.user } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Could not fetch profile' });
  }
};
