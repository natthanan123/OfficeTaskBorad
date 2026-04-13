const { BoardMember, Board, User, Notification, sequelize } = require('../models');

// ─── POST /api/boards/:id/invite ── Invite a user to a board ───
exports.inviteUserToBoard = async (req, res) => {
  // Wrap the BoardMember + Notification writes in a transaction so we never
  // end up with a "phantom" invitation that has no notification (or vice versa).
  const t = await sequelize.transaction();
  try {
    const boardId = req.params.id;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'email is required' });
    }

    // 1. Verify the board exists
    const board = await Board.findByPk(boardId, { transaction: t });
    if (!board) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    // 2. Find the target user by email
    const targetUser = await User.findOne({
      where: { email },
      transaction: t,
    });
    if (!targetUser) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'User with this email was not found' });
    }

    // 3. Block duplicate membership/invitation. The composite unique index on
    //    (user_id, board_id) is the real safety net; this gives a friendlier
    //    error message before the DB has to reject it.
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

    // 4. Create the BoardMember (pending invitation)
    const membership = await BoardMember.create(
      {
        user_id: targetUser.id,
        board_id: boardId,
        status: 'pending',
        role: 'member',
      },
      { transaction: t }
    );

    // 5. Create the Notification for the invitee
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

    // Real-time: ping the invitee's private room. Wrapped in try/catch so
    // a socket hiccup never breaks the HTTP success path.
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

    // Sequelize validation errors (role/status isIn on BoardMember)
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        status: 'error',
        message: err.errors.map((e) => e.message).join('; '),
      });
    }
    // Race-condition fallback for the (user_id, board_id) unique index
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

// ─── PUT /api/boards/:id/invite/respond ── Accept or reject an invite ───
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

    // Find this user's membership row for the given board
    const membership = await BoardMember.findOne({
      where: { user_id: req.user.id, board_id: boardId },
    });

    if (!membership) {
      return res.status(404).json({ status: 'error', message: 'Invitation not found' });
    }

    // Guard against responding twice
    if (membership.status !== 'pending') {
      return res.status(409).json({
        status: 'error',
        message: `Invitation has already been ${membership.status}`,
      });
    }

    // Reject → delete the row entirely (per spec)
    if (status === 'rejected') {
      await membership.destroy();
      return res.json({
        status: 'success',
        data: { board_id: boardId, action: 'rejected' },
      });
    }

    // Accept → flip status to 'accepted'
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
