const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { registerSchema, loginSchema } = require('../validators/userValidator');
const { register, login, forgotPassword, resetPassword, googleLogin, getMe, uploadAvatar, updateAvatar } = require('../controllers/userController');

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/google-login', googleLogin);
router.get('/me', authMiddleware, getMe);
router.post('/avatar', authMiddleware, upload.single('avatar'), uploadAvatar);
router.put('/me/avatar', authMiddleware, upload.single('avatar'), updateAvatar);

module.exports = router;
