const { BoardMember, Board, User, Notification, sequelize } = require('../models');

exports.inviteUserToBoard = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const boardId = req.params.id;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'email is required' });
    }

    const board = await Board.findByPk(boardId, { transaction: t });
    if (!board) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    const targetUser = await User.findOne({
      where: { email },
      transaction: t,
    });
    if (!targetUser) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'User with this email was not found' });
    }

    const existing = await BoardMember.findOne({
      where: { user_id: targetUser.id, board_id: boardId },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      const message =
        existing.status === 'pending'
          ? 'User has already been invited to this board'
          : 'User is already a member of this board';
      return res.status(409).json({ status: 'error', message });
    }

    const membership = await BoardMember.create(
      {
        user_id: targetUser.id,
        board_id: boardId,
        status: 'pending',
        role: 'member',
      },
      { transaction: t }
    );

    const notification = await Notification.create(
      {
        user_id: targetUser.id,
        type: 'board_invite',
        message: 'You have been invited to join a board',
        reference_id: boardId,
      },
      { transaction: t }
    );

    await t.commit();

    try {
      req.app.get('io')
        .to(`user_${targetUser.id}`)
        .emit('new_notification', { notification });
    } catch (socketErr) {
      console.error('socket emit (new_notification) failed:', socketErr);
    }

    return res.status(201).json({
      status: 'success',
      data: { membership, notification },
    });
  } catch (err) {
    await t.rollback();

    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        status: 'error',
        message: err.errors.map((e) => e.message).join('; '),
      });
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        status: 'error',
        message: 'User has already been invited to this board',
      });
    }

    console.error('inviteUserToBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not send invitation' });
  }
};

exports.respondToInvite = async (req, res) => {
  try {
    const boardId = req.params.id;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: "status must be either 'accepted' or 'rejected'",
      });
    }

    const membership = await BoardMember.findOne({
      where: { user_id: req.user.id, board_id: boardId },
    });

    if (!membership) {
      return res.status(404).json({ status: 'error', message: 'Invitation not found' });
    }

    if (membership.status !== 'pending') {
      return res.status(409).json({
        status: 'error',
        message: `Invitation has already been ${membership.status}`,
      });
    }

    if (status === 'rejected') {
      await membership.destroy();
      return res.json({
        status: 'success',
        data: { board_id: boardId, action: 'rejected' },
      });
    }

    membership.status = 'accepted';
    await membership.save();

    return res.json({ status: 'success', data: { membership } });
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        status: 'error',
        message: err.errors.map((e) => e.message).join('; '),
      });
    }
    console.error('respondToInvite error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not respond to invitation' });
  }
};
