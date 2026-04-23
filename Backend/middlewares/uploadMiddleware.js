const multer = require('multer');
const path = require('path');
const fs = require('fs');

const avatarDir     = path.join(__dirname, '..', 'uploads', 'avatars');
const attachmentDir = path.join(__dirname, '..', 'uploads', 'attachments');
fs.mkdirSync(avatarDir,     { recursive: true });
fs.mkdirSync(attachmentDir, { recursive: true });

function buildFilename(file) {
  const ext = path.extname(file.originalname);
  return `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename:    (_req, file, cb) => cb(null, buildFilename(file)),
});

const avatarFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only jpeg, jpg, png, and gif files are allowed'), false);
};

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, attachmentDir),
  filename:    (_req, file, cb) => cb(null, buildFilename(file)),
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

module.exports = avatarUpload;
module.exports.avatarUpload     = avatarUpload;
module.exports.attachmentUpload = attachmentUpload;
