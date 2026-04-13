const {
  Task,
  Column,
  Label,
  TaskLabel,
  TaskComment,
  User,
  Notification,
  sequelize,
} = require('../models');

// ─── Helper: broadcast a real-time refresh hint to a board's room ───
function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

// ─── Helper: resolve the board id behind a task via its column ───
async function resolveBoardIdForTask(task) {
  if (!task) return null;
  const column = await Column.findByPk(task.column_id);
  return column ? column.board_id : null;
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

// ─── PUT /:id/complete ── Toggle the is_completed checkbox on a task ───
exports.toggleTaskComplete = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { is_completed } = req.body;
    if (typeof is_completed !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'is_completed must be a boolean' });
    }

    task.is_completed = is_completed;
    await task.save();

    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_completed');

    return res.json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('toggleTaskComplete error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update task status' });
  }
};

// ─── PUT /:id/due_date ── Update only the due date of a task ───
exports.setTaskDueDate = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    // Allow explicit null to clear the date. Anything else is passed straight
    // to Sequelize so it can coerce the incoming string into DATEONLY.
    const { due_date } = req.body;
    task.due_date = due_date || null;
    await task.save();

    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_due_date_changed');

    return res.json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('setTaskDueDate error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update due date' });
  }
};

// ─── POST /:id/comments ── Add a comment to a task ───
exports.addTaskComment = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ status: 'error', message: 'content is required' });
    }

    const created = await TaskComment.create({
      task_id: task.id,
      user_id: req.user.id,
      content: content.trim(),
    });

    // Reload with the author eager-loaded so the client can render immediately
    // without having to re-fetch the whole board.
    const comment = await TaskComment.findByPk(created.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email'] },
    });

    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_comment_added');

    return res.status(201).json({ status: 'success', data: { comment } });
  } catch (err) {
    console.error('addTaskComment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not add comment' });
  }
};

// ─── POST /:id/labels ── Toggle a label link on a task ───
exports.toggleTaskLabel = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { label_id } = req.body;
    if (!label_id) {
      return res.status(400).json({ status: 'error', message: 'label_id is required' });
    }

    const label = await Label.findByPk(label_id);
    if (!label) {
      return res.status(404).json({ status: 'error', message: 'Label not found' });
    }

    // Toggle: if the junction row exists, remove it; otherwise create it.
    const existing = await TaskLabel.findOne({
      where: { task_id: task.id, label_id: label.id },
    });

    let attached;
    if (existing) {
      await existing.destroy();
      attached = false;
    } else {
      await TaskLabel.create({ task_id: task.id, label_id: label.id });
      attached = true;
    }

    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_label_toggled');

    return res.json({
      status: 'success',
      data: { task_id: task.id, label_id: label.id, attached },
    });
  } catch (err) {
    console.error('toggleTaskLabel error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not toggle label' });
  }
};

// ─── POST /:id/assign ── Toggle a user assignment + notify the target ───
exports.assignTaskUser = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const task = await Task.findByPk(req.params.id, { transaction: t });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { user_id } = req.body;
    if (!user_id) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'user_id is required' });
    }

    const user = await User.findByPk(user_id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Toggle via the association helpers — no direct TaskAssignee model needed.
    const current = await task.getAssignees({ transaction: t });
    const isAssigned = current.some(u => String(u.id) === String(user_id));

    let assigned;
    let notification = null;
    if (isAssigned) {
      await task.removeAssignee(user, { transaction: t });
      assigned = false;
    } else {
      await task.addAssignee(user, { transaction: t });
      assigned = true;

      // Create a notification row for the new assignee so they see it in
      // their notification list on next fetch (and via the live emit below).
      notification = await Notification.create(
        {
          user_id: user.id,
          type: 'task_assigned',
          message: 'You have been assigned to a task',
          reference_id: task.id,
        },
        { transaction: t }
      );
    }

    await t.commit();

    // Real-time fan-out: board refresh for everyone viewing the board, and
    // a private notification ping for the newly-assigned user.
    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_assignee_toggled');

    if (assigned && notification) {
      try {
        req.app.get('io')
          .to(`user_${user.id}`)
          .emit('new_notification', { notification });
      } catch (socketErr) {
        console.error('socket emit (new_notification) failed:', socketErr);
      }
    }

    return res.json({
      status: 'success',
      data: { task_id: task.id, user_id: user.id, assigned },
    });
  } catch (err) {
    await t.rollback();
    console.error('assignTaskUser error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update assignees' });
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
