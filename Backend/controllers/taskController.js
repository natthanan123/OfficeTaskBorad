const {
  Task,
  Column,
  Board,
  Label,
  TaskLabel,
  TaskComment,
  User,
  BoardMember,
  Notification,
  ActivityLog,
  Attachment,
  CommentReaction,
  sequelize,
} = require('../models');
const { parseUrlsToAttachments } = require('../utils/parseUrlsToAttachments');
const { processMentionsForComment } = require('../utils/mentionUtil');
const { sanitizeHtml } = require('../utils/sanitizeHtml');

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

async function userHasBoardAccess(userId, boardId, userRole) {
  if (!boardId) return false;
  if (userRole === 'admin') return true;
  const [member, board] = await Promise.all([
    BoardMember.findOne({ where: { user_id: userId, board_id: boardId, status: 'accepted' } }),
    Board.findByPk(boardId),
  ]);
  if (member) return true;
  return !!(board && String(board.creator_id) === String(userId));
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

    const clean = sanitizeHtml(content.trim());
    if (!clean) {
      return res.status(400).json({ status: 'error', message: 'content is empty after sanitization' });
    }

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
      content: clean,
      parent_id: parent_id || null,
    });

    const comment = await TaskComment.findByPk(created.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email', 'profile_picture', 'avatar_url'] },
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

    await parseUrlsToAttachments(clean, task.id, 'comment', req.user.id);

    await processMentionsForComment({
      content: clean,
      commentId: created.id,
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

exports.copyTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const original = await Task.findByPk(req.params.id, {
      include: [
        { model: Label, as: 'labels', through: { attributes: [] } },
        { model: Attachment, as: 'attachments' },
        {
          model: TaskComment,
          as: 'comments',
          include: [{ model: CommentReaction, as: 'reactions' }],
        },
      ],
      transaction: t,
    });
    if (!original) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const sourceColumn = await Column.findByPk(original.column_id, { transaction: t });
    const sourceBoardId = sourceColumn ? sourceColumn.board_id : null;
    if (!(await userHasBoardAccess(req.user.id, sourceBoardId, req.user.role))) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const targetColumnId = req.body.column_id || original.column_id;
    const targetColumn = await Column.findByPk(targetColumnId, { transaction: t });
    if (!targetColumn) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Target column not found' });
    }

    if (String(targetColumn.board_id) !== String(sourceBoardId)) {
      if (!(await userHasBoardAccess(req.user.id, targetColumn.board_id, req.user.role))) {
        await t.rollback();
        return res.status(403).json({ status: 'error', message: 'Forbidden on target board' });
      }
    }

    const isCrossBoard = String(targetColumn.board_id) !== String(sourceBoardId);

    const maxPos = await Task.max('position', { where: { column_id: targetColumnId }, transaction: t });
    const finalPosition = (maxPos ?? -1) + 1;

    const rawTitle = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const newTitle = rawTitle || `${original.title} (copy)`;

    const copy = await Task.create({
      column_id: targetColumnId,
      title: newTitle,
      description: original.description,
      due_date: original.due_date,
      position: finalPosition,
    }, { transaction: t });

    //Labels
    if (isCrossBoard) {
      const targetLabels = await Label.findAll({ where: { board_id: targetColumn.board_id }, transaction: t });
      const labelKey = (l) => `${(l.title || '').trim().toLowerCase()}|${(l.color || '').trim().toLowerCase()}`;
      const targetLabelMap = new Map(targetLabels.map(l => [labelKey(l), l.id]));
      const matched = (original.labels || [])
        .map(l => targetLabelMap.get(labelKey(l)))
        .filter(Boolean);
      if (matched.length && typeof copy.setLabels === 'function') {
        await copy.setLabels(matched, { transaction: t });
      }
    } else {
      const originalLabels = await TaskLabel.findAll({
        where: { task_id: original.id },
        transaction: t,
      });
      for (const tl of originalLabels) {
        await TaskLabel.create(
          { task_id: copy.id, label_id: tl.label_id },
          { transaction: t }
        );
      }
    }

    //Assignees
    const origAssignees = await original.getAssignees({ transaction: t });
    let allowedUserIds;
    if (isCrossBoard) {
      const targetMembers = await BoardMember.findAll({
        where: { board_id: targetColumn.board_id, status: 'accepted' },
        transaction: t,
      });
      const targetMemberIds = new Set(targetMembers.map(m => String(m.user_id)));
      allowedUserIds = origAssignees.filter(u => targetMemberIds.has(String(u.id)));
    } else {
      allowedUserIds = origAssignees;
    }
    for (const u of allowedUserIds) {
      await copy.addAssignee(u, { transaction: t });
    }

    //Attachments
    for (const att of (original.attachments || [])) {
      await Attachment.create({
        task_id: copy.id,
        user_id: att.user_id || null,
        filename_or_url: att.filename_or_url,
        mimetype: att.mimetype,
        size: att.size,
        is_cover: att.is_cover,
        source: att.source || 'direct_upload',
      }, { transaction: t });
    }

    //Comments
    const commentIdMap = new Map();
    const orderedComments = (original.comments || []).slice().sort((a, b) => {
      const ad = new Date(a.created_at || 0).getTime();
      const bd = new Date(b.created_at || 0).getTime();
      return ad - bd;
    });
    for (const c of orderedComments) {
      if (c.parent_id) continue;
      const newC = await TaskComment.create({
        task_id: copy.id,
        user_id: c.user_id,
        content: c.content,
        parent_id: null,
      }, { transaction: t });
      commentIdMap.set(String(c.id), newC.id);
      for (const r of (c.reactions || [])) {
        await CommentReaction.create({
          comment_id: newC.id,
          user_id: r.user_id,
          emoji: r.emoji,
        }, { transaction: t });
      }
    }
    for (const c of orderedComments) {
      if (!c.parent_id) continue;
      const newParent = commentIdMap.get(String(c.parent_id));
      if (!newParent) continue;
      const newC = await TaskComment.create({
        task_id: copy.id,
        user_id: c.user_id,
        content: c.content,
        parent_id: newParent,
      }, { transaction: t });
      commentIdMap.set(String(c.id), newC.id);
      for (const r of (c.reactions || [])) {
        await CommentReaction.create({
          comment_id: newC.id,
          user_id: r.user_id,
          emoji: r.emoji,
        }, { transaction: t });
      }
    }

    await t.commit();

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
    try { await t.rollback(); } catch (_) {}
    console.error('copyTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not copy task' });
  }
};

exports.toggleTaskWatch = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const boardId = await resolveBoardIdForTask(task);
    if (!(await userHasBoardAccess(req.user.id, boardId, req.user.role))) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const currentWatchers = await task.getWatchers();
    const isWatching = currentWatchers.some(u => String(u.id) === String(req.user.id));

    if (isWatching) {
      await task.removeWatcher(req.user);
    } else {
      await task.addWatcher(req.user);
    }

    const updated = await task.getWatchers({ attributes: ['id'] });
    const watchers = updated.map(u => String(u.id));

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: isWatching ? 'UNWATCH_TASK' : 'WATCH_TASK',
      details:     {},
    });

    return res.json({ status: 'success', data: { watching: !isWatching, watchers } });
  } catch (err) {
    console.error('toggleTaskWatch error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not toggle watch' });
  }
};

/**
 * POST /api/tasks/:id/archive
 * Soft-deletes a task by setting archived_at. Only board members can archive.
 */
exports.archiveTask = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    const boardId = await resolveBoardIdForTask(task);
    if (!(await userHasBoardAccess(req.user.id, boardId, req.user.role))) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    task.archived_at = new Date();
    await task.save();

    emitBoardUpdate(req, boardId, 'task_archived');

    await logActivity({
      board_id:    boardId,
      user_id:     req.user.id,
      task_id:     task.id,
      action_type: 'ARCHIVE_TASK',
      details:     { title: task.title },
    });

    return res.json({ status: 'success', data: { task_id: task.id, archived_at: task.archived_at } });
  } catch (err) {
    console.error('archiveTask error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not archive task' });
  }
};
