const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getNotifications,
  markAsRead,
} = require('../controllers/notificationController');

router.use(authMiddleware);

router.get('/',          getNotifications);
router.put('/:id/read',  markAsRead);

module.exports = router;
