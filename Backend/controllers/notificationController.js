const { Notification } = require('../models');

// GET /api/notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });

    return res.json({
      status: 'success',
      data: { notifications },
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch notifications' });
  }
};

// PUT /api/notifications/:id/read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({ status: 'error', message: 'Notification not found' });
    }

    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    if (!notification.is_read) {
      notification.is_read = true;
      await notification.save();
    }

    return res.json({
      status: 'success',
      data: { notification },
    });
  } catch (err) {
    console.error('markAsRead error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update notification' });
  }
};
