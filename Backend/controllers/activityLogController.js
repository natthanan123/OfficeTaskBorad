const { ActivityLog, Board, BoardMember, User, Task } = require('../models');

// GET /api/boards/:id/logs — Audit trail, newest first.
// Visible to admin / board creator / accepted members. Pagination via
// ?limit= (default 50, capped at 200) and ?offset= (default 0).
exports.getBoardLogs = async (req, res) => {
  try {
    const boardId = req.params.id;

    const board = await Board.findByPk(boardId);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (req.user.role !== 'admin' && board.creator_id !== req.user.id) {
      const membership = await BoardMember.findOne({
        where: {
          user_id: req.user.id,
          board_id: boardId,
          status: 'accepted',
        },
      });
      if (!membership) {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have access to this board',
        });
      }
    }

    // Invalid/missing query strings fall back to defaults rather than 400.
    const rawLimit  = parseInt(req.query.limit,  10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit  = Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit, 200) : 50;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const { rows, count } = await ActivityLog.findAndCountAll({
      where: { board_id: boardId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'full_name', 'email'],
        },
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      status: 'success',
      data: {
        logs: rows,
        pagination: {
          total: count,
          limit,
          offset,
        },
      },
    });
  } catch (err) {
    console.error('getBoardLogs error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch activity logs' });
  }
};
