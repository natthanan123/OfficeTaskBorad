const {
  Task,
  Column,
  Label,
  TaskLabel,
  TaskComment,
  User,
  Notification,
  ActivityLog,
  sequelize,
} = require('../models');
const { parseUrlsToAttachments } = require('../utils/parseUrlsToAttachments');

function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

async function logActivity({ board_id, user_id, task_id = null, action_type, details = null }) {
  if (!board_id || !action_type) return;
  try {
    await ActivityLog.create({ board_id, user_id, task_id, action_type, details });
  } catch (logErr) {
    console.error(`activityLog (${action_type}) failed:`, logErr);
  }
}

async function resolveBoardIdForTask(task) {
  if (!task) return null;
  const column = await Column.findByPk(task.column_id);
  return column ? column.board_id : null;
}

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

    emitBoardUpdate(req, column.board_id, 'task_created');

    await logActivity({
      board_id:    column.board_id,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'CREATE_TASK',
      details:     { title: task.title, column_id: column.id },
    });

    return res.status(201).json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('createTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create task' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const { title, description, due_date, column_id, position } = req.body;

    const originalColumnId    = task.column_id;
    const originalDescription = task.description;
    let targetColumn = null;

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

    const currentColumn =
      targetColumn || (await Column.findByPk(task.column_id));
    if (currentColumn) {
      emitBoardUpdate(req, currentColumn.board_id, 'task_updated');

      if (originalColumnId && originalColumnId !== task.column_id) {
        const sourceColumn = await Column.findByPk(originalColumnId);
        if (sourceColumn && sourceColumn.board_id !== currentColumn.board_id) {
          emitBoardUpdate(req, sourceColumn.board_id, 'task_updated');
        }
      }
    }

    if (originalColumnId && originalColumnId !== task.column_id && currentColumn) {
      await logActivity({
        board_id:    currentColumn.board_id,
        user_id:     req.user.id,
        task_id:     task.id,
        action_type: 'MOVE_TASK',
        details:     { from_column: originalColumnId, to_column: task.column_id },
      });
    }

    if (description !== undefined && currentColumn) {
      const prev = originalDescription == null ? '' : String(originalDescription);
      const next = task.description   == null ? '' : String(task.description);
      if (prev !== next) {
        await logActivity({
          board_id:    currentColumn.board_id,
          user_id:     req.user.id,
          task_id:     task.id,
          action_type: 'UPDATE_DESCRIPTION',
          details:     { title: task.title },
        });

        await parseUrlsToAttachments(next, task.id, 'description', req.user.id);
      }
    }

    return res.json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('updateTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update task' });
  }
};

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

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'UPDATE_STATUS',
      details:     { is_completed: task.is_completed },
    });

    return res.json({ status: 'success', data: { task } });
  } catch (err) {
    console.error('toggleTaskComplete error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update task status' });
  }
};

exports.setTaskDueDate = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

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

    const comment = await TaskComment.findByPk(created.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email'] },
    });

    const boardId = await resolveBoardIdForTask(task);
    emitBoardUpdate(req, boardId, 'task_comment_added');

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'ADD_COMMENT',
      details:     { comment_id: created.id },
    });

    await parseUrlsToAttachments(content.trim(), task.id, 'comment', req.user.id);

    return res.status(201).json({ status: 'success', data: { comment } });
  } catch (err) {
    console.error('addTaskComment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not add comment' });
  }
};

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

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'TOGGLE_LABEL',
      details:     { label_id: label.id, attached },
    });

    return res.json({
      status: 'success',
      data: { task_id: task.id, label_id: label.id, attached },
    });
  } catch (err) {
    console.error('toggleTaskLabel error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not toggle label' });
  }
};

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

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'ASSIGN_MEMBER',
      details:     { target_user_id: user.id, assigned },
    });

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

exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const column = await Column.findByPk(task.column_id);
    const boardId = column ? column.board_id : null;
    const deletedTitle = task.title;
    const deletedTaskId = task.id;

    await task.destroy();

    emitBoardUpdate(req, boardId, 'task_deleted');

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     null,
      action_type: 'DELETE_TASK',
      details:     { title: deletedTitle, task_id: deletedTaskId },
    });

    return res.json({ status: 'success', message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete task' });
  }
};
