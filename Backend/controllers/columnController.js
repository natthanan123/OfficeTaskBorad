const { Column, Board, ActivityLog } = require('../models');

function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

// Fire-and-forget audit write — a failed log must never break the main flow.
async function logActivity({ board_id, user_id, task_id = null, action_type, details = null }) {
  if (!board_id || !action_type) return;
  try {
    await ActivityLog.create({ board_id, user_id, task_id, action_type, details });
  } catch (logErr) {
    console.error(`activityLog (${action_type}) failed:`, logErr);
  }
}

// POST / — Create a column for a board.
exports.createColumn = async (req, res) => {
  try {
    const { board_id, title, position, color } = req.body;

    if (!board_id || !title) {
      return res.status(400).json({ status: 'error', message: 'board_id and title are required' });
    }

    const board = await Board.findByPk(board_id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    let finalPosition = position;
    if (finalPosition === undefined || finalPosition === null) {
      const maxPos = await Column.max('position', { where: { board_id } });
      finalPosition = (maxPos ?? -1) + 1;
    }

    const column = await Column.create({
      board_id,
      title,
      position: finalPosition,
      color: typeof color === 'string' && color.trim() ? color.trim() : null,
    });

    emitBoardUpdate(req, board_id, 'column_created');

    return res.status(201).json({ status: 'success', data: { column } });
  } catch (err) {
    console.error('createColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create column' });
  }
};

// PUT /:id — Update title and/or position.
exports.updateColumn = async (req, res) => {
  try {
    const column = await Column.findByPk(req.params.id);
    if (!column) {
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    const { title, position, color } = req.body;

    if (title !== undefined) column.title = title;
    if (position !== undefined) column.position = position;
    // Allow null/empty to clear the color
    if (color !== undefined) column.color = (typeof color === 'string' && color.trim()) ? color.trim() : null;

    await column.save();

    emitBoardUpdate(req, column.board_id, 'column_updated');

    return res.json({ status: 'success', data: { column } });
  } catch (err) {
    console.error('updateColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update column' });
  }
};

// DELETE /:id — Tasks cascade via the FK association in models/index.js.
exports.deleteColumn = async (req, res) => {
  try {
    const column = await Column.findByPk(req.params.id);
    if (!column) {
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    // Snapshot before destroy so we can still reference these in the
    // emit + audit-log writes below.
    const boardId         = column.board_id;
    const deletedTitle    = column.title;
    const deletedColumnId = column.id;

    await column.destroy();

    emitBoardUpdate(req, boardId, 'column_deleted');

    await logActivity({
      board_id:    boardId,
      user_id:     req.user ? req.user.id : null,
      task_id:     null,
      action_type: 'DELETE_COLUMN',
      details:     { title: deletedTitle, column_id: deletedColumnId },
    });

    return res.json({ status: 'success', message: 'Column deleted' });
  } catch (err) {
    console.error('deleteColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete column' });
  }
};
