const { ActivityLog, Board, BoardMember, User, Task } = require('../models');

// ─── GET /api/boards/:id/logs ── Audit trail for a single board ───
// Visibility rules:
//   • admin           → may read any board's logs
//   • board creator   → always allowed (covers legacy boards with no
//                       membership row, mirroring getBoards)
//   • accepted member → allowed
//   • anyone else     → 403
//
// Pagination is query-string driven (?limit=50&offset=0). The default
// limit of 50 matches the "recent activity" panel the frontend will
// render; a hard ceiling of 200 keeps a single request from dragging
// the whole table back.
exports.getBoardLogs = async (req, res) => {
  try {
    const boardId = req.params.id;

    // 1. Board must exist — return a real 404 rather than a confusing 403.
    const board = await Board.findByPk(boardId);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    // 2. Permission check. Admins bypass the membership lookup.
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

    // 3. Parse + clamp pagination. Invalid input falls back to defaults
    //    instead of 400-ing so a slightly wrong query string still works.
    const rawLimit  = parseInt(req.query.limit,  10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit  = Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit, 200) : 50;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    // 4. Fetch the page. findAndCountAll gives us `total` so the client
    //    can render "showing 50 of 312" without a second round-trip.
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
          required: false, // task_id is optional
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
