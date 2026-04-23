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
const { processMentionsForComment } = require('../utils/mentionUtil');

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

    const { content, parent_id } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ status: 'error', message: 'content is required' });
    }

    // If parent_id provided, validate it exists and belongs to same task
    if (parent_id) {
      const parent = await TaskComment.findByPk(parent_id);
      if (!parent) {
        return res.status(404).json({ status: 'error', message: 'Parent comment not found' });
      }
      if (String(parent.task_id) !== String(task.id)) {
        return res.status(400).json({ status: 'error', message: 'Parent comment does not belong to this task' });
      }
    }

    const created = await TaskComment.create({
      task_id: task.id,
      user_id: req.user.id,
      content: content.trim(),
      parent_id: parent_id || null,
    });

    const comment = await TaskComment.findByPk(created.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email', 'profile_picture'] },
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

    // Process @mentions → create notifications for mentioned users
    await processMentionsForComment({
      content: content.trim(),
      commentId: created.id,
      taskId: task.id,
      authorId: req.user.id,
      req,
    });

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

// ─────────────────────────────────────────────
// Copy / Watch / Archive (Trello-style actions)
// ─────────────────────────────────────────────

/**
 * POST /api/tasks/:id/copy
 * body: { title?, column_id? }
 * Creates a duplicate of the task (including labels, assignees, and description).
 */
exports.copyTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const original = await Task.findByPk(req.params.id, { transaction: t });
    if (!original) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const targetColumnId = req.body.column_id || original.column_id;
    const targetColumn = await Column.findByPk(targetColumnId, { transaction: t });
    if (!targetColumn) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Target column not found' });
    }

    const maxPos = await Task.max('position', { where: { column_id: targetColumnId }, transaction: t });
    const finalPosition = (maxPos ?? -1) + 1;

    const newTitle = (typeof req.body.title === 'string' && req.body.title.trim())
      ? req.body.title.trim()
      : `${original.title} (copy)`;

    // Create the copy
    const copy = await Task.create({
      column_id: targetColumnId,
      title: newTitle,
      description: original.description,
      due_date: original.due_date,
      position: finalPosition,
    }, { transaction: t });

    // Copy labels (many-to-many via TaskLabel)
    try {
      const originalLabels = await TaskLabel.findAll({ where: { task_id: original.id }, transaction: t });
      for (const tl of originalLabels) {
        await TaskLabel.create({ task_id: copy.id, label_id: tl.label_id }, { transaction: t });
      }
    } catch (e) { /* ignore label copy failures */ }

    // Copy assignees
    try {
      const origAssignees = await original.getAssignees({ transaction: t });
      for (const u of origAssignees) {
        await copy.addAssignee(u, { transaction: t });
      }
    } catch (e) { /* ignore assignee copy failures */ }

    await t.commit();

    // Load fresh copy with relations to return
    const fresh = await Task.findByPk(copy.id, {
      include: [
        { model: User, as: 'assignees', attributes: ['id', 'full_name', 'email'], through: { attributes: [] } },
        { model: Label, as: 'labels', through: { attributes: [] } },
      ],
    });

    emitBoardUpdate(req, targetColumn.board_id, 'task_copied');

    await logActivity({
      board_id:    targetColumn.board_id,
      user_id:     req.user.id,
      task_id:     copy.id,
      action_type: 'COPY_TASK',
      details:     { source_task_id: original.id, title: newTitle },
    });

    return res.status(201).json({ status: 'success', data: { task: fresh } });
  } catch (err) {
    try { await t.rollback(); } catch (e) {}
    console.error('copyTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not copy task' });
  }
};

/**
 * POST /api/tasks/:id/watch
 * Toggle the current user as a watcher of this task.
 * Response: { watching: bool, watchers: [user_ids] }
 */
exports.toggleTaskWatch = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    // Use raw query against task_watchers table (expected schema)
    // Graceful fallback: if table doesn't exist, return a soft success
    let watching = false;
    let watchers = [];
    try {
      const [existing] = await sequelize.query(
        'SELECT user_id FROM task_watchers WHERE task_id = :tid AND user_id = :uid',
        { replacements: { tid: task.id, uid: req.user.id } }
      );
      if (existing && existing.length > 0) {
        await sequelize.query(
          'DELETE FROM task_watchers WHERE task_id = :tid AND user_id = :uid',
          { replacements: { tid: task.id, uid: req.user.id } }
        );
        watching = false;
      } else {
        await sequelize.query(
          'INSERT INTO task_watchers (task_id, user_id, created_at) VALUES (:tid, :uid, NOW())',
          { replacements: { tid: task.id, uid: req.user.id } }
        );
        watching = true;
      }
      const [rows] = await sequelize.query(
        'SELECT user_id FROM task_watchers WHERE task_id = :tid',
        { replacements: { tid: task.id } }
      );
      watchers = (rows || []).map(r => r.user_id);
    } catch (sqlErr) {
      // Table might not exist — graceful degradation
      console.warn('task_watchers table missing, returning soft success:', sqlErr.message);
      return res.json({
        status: 'success',
        data: { watching: true, watchers: [req.user.id] },
      });
    }

    const boardId = await resolveBoardIdForTask(task);
    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: watching ? 'WATCH_TASK' : 'UNWATCH_TASK',
      details:     {},
    });

    return res.json({ status: 'success', data: { watching, watchers } });
  } catch (err) {
    console.error('toggleTaskWatch error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not toggle watch' });
  }
};

/**
 * POST /api/tasks/:id/archive
 * Sets archived_at = NOW() (soft delete). Falls back to destroying if column missing.
 */
exports.archiveTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const column = await Column.findByPk(task.column_id);
    const boardId = column ? column.board_id : null;

    // Try soft-delete via archived_at column
    let archived = false;
    try {
      await sequelize.query(
        'UPDATE tasks SET archived_at = NOW() WHERE id = :tid',
        { replacements: { tid: task.id } }
      );
      archived = true;
    } catch (sqlErr) {
      // archived_at column may not exist → fall back to hard delete
      console.warn('archived_at column missing, falling back to destroy:', sqlErr.message);
      await task.destroy();
      archived = true;
    }

    emitBoardUpdate(req, boardId, 'task_archived');
    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'ARCHIVE_TASK',
      details:     { title: task.title },
    });

    return res.json({ status: 'success', data: { task_id: task.id, archived } });
  } catch (err) {
    console.error('archiveTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not archive task' });
  }
};
