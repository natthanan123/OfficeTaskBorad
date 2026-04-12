const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getNotifications,
  markAsRead,
} = require('../controllers/notificationController');

// All notification routes require authentication
router.use(authMiddleware);

router.get('/',          getNotifications);
router.put('/:id/read',  markAsRead);

module.exports = router;
