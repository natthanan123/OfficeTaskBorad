const { Task, Column } = require('../models');

// ─── Helper: broadcast a real-time refresh hint to a board's room ───
function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

// ─── POST / ── Create a task in a column ───
exports.createTask = async (req, res) => {
  try {
    const { column_id, title, description, due_date, position } = req.body;

    if (!column_id || !title) {
      return res.status(400).json({ status: 'error', message: 'column_id and title are required' });
    }

    const column = await Column.findByPk(column_id);
    if (!column) {
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    // If no position provided, append to the end
    let finalPosition = position;
    if (finalPosition === undefined || finalPosition === null) {
      const maxPos = await Task.max('position', { where: { column_id } });
      finalPosition = (maxPos ?? -1) + 1;
    }

    const task = await Task.create({
      column_id,
      title,
      description,
      due_date,
      position: finalPosition,
    });

    // board_id is already on the column we fetched above — no extra query
    emitBoardUpdate(req, column.board_id, 'task_created');

    return res.status(201).json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('createTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create task' });
  }
};

// ─── PUT /:id ── Update task details / move between columns ───
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { title, description, due_date, column_id, position } = req.body;

    // Remember the ORIGINAL column so we can emit to the source board too
    // if this turns out to be a cross-board move (rare, but correct).
    const originalColumnId = task.column_id;
    let targetColumn = null;

    // If moving to a different column, verify it exists
    if (column_id !== undefined && column_id !== task.column_id) {
      targetColumn = await Column.findByPk(column_id);
      if (!targetColumn) {
        return res.status(404).json({ status: 'error', message: 'Target column not found' });
      }
      task.column_id = column_id;
    }

    if (title !== undefined)       task.title = title;
    if (description !== undefined) task.description = description;
    if (due_date !== undefined)    task.due_date = due_date;
    if (position !== undefined)    task.position = position;

    await task.save();

    // Resolve the board id for the emit. If we already have targetColumn
    // from the move branch, reuse it; otherwise look up the current column.
    const currentColumn =
      targetColumn || (await Column.findByPk(task.column_id));
    if (currentColumn) {
      emitBoardUpdate(req, currentColumn.board_id, 'task_updated');

      // Cross-board move: also ping the source board so users viewing the
      // old board see the task disappear without a manual refresh.
      if (originalColumnId && originalColumnId !== task.column_id) {
        const sourceColumn = await Column.findByPk(originalColumnId);
        if (sourceColumn && sourceColumn.board_id !== currentColumn.board_id) {
          emitBoardUpdate(req, sourceColumn.board_id, 'task_updated');
        }
      }
    }

    return res.json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('updateTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update task' });
  }
};

// ─── DELETE /:id ── Remove a task ───
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    // Resolve board_id BEFORE destroy, while the task + column still exist.
    const column = await Column.findByPk(task.column_id);
    const boardId = column ? column.board_id : null;

    await task.destroy();

    emitBoardUpdate(req, boardId, 'task_deleted');

    return res.json({ status: 'success', message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete task' });
  }
};
