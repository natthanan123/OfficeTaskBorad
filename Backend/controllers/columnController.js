const {
  Column,
  Board,
  ActivityLog,
  Task,
  Label,
  TaskLabel,
  TaskComment,
  Attachment,
  CommentReaction,
  BoardMember,
  sequelize,
} = require('../models');

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

//Copy Column across boards
exports.copyColumn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sourceColumn = await Column.findByPk(req.params.id, { transaction: t });
    if (!sourceColumn) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    if (!(await userHasBoardAccess(req.user.id, sourceColumn.board_id, req.user.role))) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const targetBoardId = req.body.target_board_id || sourceColumn.board_id;
    const targetBoard = await Board.findByPk(targetBoardId, { transaction: t });
    if (!targetBoard) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Target board not found' });
    }
    if (!(await userHasBoardAccess(req.user.id, targetBoard.id, req.user.role))) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Forbidden on target board' });
    }

    const rawTitle = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const newTitle = rawTitle || `${sourceColumn.title} (copy)`;

    const maxPos = await Column.max('position', { where: { board_id: targetBoardId }, transaction: t });
    const finalPosition = (maxPos ?? -1) + 1;

    const newColumn = await Column.create({
      board_id: targetBoardId,
      title: newTitle,
      position: finalPosition,
      color: sourceColumn.color,
    }, { transaction: t });

    const targetLabels = await Label.findAll({ where: { board_id: targetBoardId }, transaction: t });
    const labelKey = (l) => `${(l.title || '').trim().toLowerCase()}|${(l.color || '').trim().toLowerCase()}`;
    const targetLabelMap = new Map(targetLabels.map(l => [labelKey(l), l.id]));

    const targetMembers = await BoardMember.findAll({
      where: { board_id: targetBoardId, status: 'accepted' },
      transaction: t,
    });
    const targetMemberIds = new Set(targetMembers.map(m => String(m.user_id)));

    const sourceTasks = await Task.findAll({
      where: { column_id: sourceColumn.id },
      include: [
        { model: Label, as: 'labels', through: { attributes: [] } },
        { model: Attachment, as: 'attachments' },
        {
          model: TaskComment,
          as: 'comments',
          include: [{ model: CommentReaction, as: 'reactions' }],
        },
      ],
      order: [['position', 'ASC']],
      transaction: t,
    });

    const taskAssignees = await Promise.all(
      sourceTasks.map(task => task.getAssignees({ attributes: ['id'], transaction: t }))
    );

    for (let i = 0; i < sourceTasks.length; i++) {
      const task = sourceTasks[i];
      const newTask = await Task.create({
        column_id: newColumn.id,
        title: task.title,
        description: task.description,
        position: task.position,
        due_date: task.due_date,
        is_completed: task.is_completed,
      }, { transaction: t });

      const isSameBoard = String(targetBoardId) === String(sourceColumn.board_id);

      const labelIdsToAttach = [];
      for (const lbl of (task.labels || [])) {
        if (isSameBoard) {
          labelIdsToAttach.push(lbl.id);
        } else {
          const matchId = targetLabelMap.get(labelKey(lbl));
          if (matchId) labelIdsToAttach.push(matchId);
        }
      }
      if (labelIdsToAttach.length && typeof newTask.setLabels === 'function') {
        await newTask.setLabels(labelIdsToAttach, { transaction: t });
      }

      const assignees = taskAssignees[i] || [];
      const assigneeIdsToAttach = assignees
        .map(u => u.id)
        .filter(id => isSameBoard || targetMemberIds.has(String(id)));
      if (assigneeIdsToAttach.length && typeof newTask.setAssignees === 'function') {
        await newTask.setAssignees(assigneeIdsToAttach, { transaction: t });
      }

      for (const att of (task.attachments || [])) {
        await Attachment.create({
          task_id: newTask.id,
          user_id: att.user_id || null,
          filename_or_url: att.filename_or_url,
          mimetype: att.mimetype,
          size: att.size,
          is_cover: att.is_cover,
          source: att.source || 'direct_upload',
        }, { transaction: t });
      }

      const commentIdMap = new Map();
      const orderedComments = (task.comments || []).slice().sort((a, b) => {
        const ad = new Date(a.created_at || 0).getTime();
        const bd = new Date(b.created_at || 0).getTime();
        return ad - bd;
      });
      for (const c of orderedComments) {
        if (c.parent_id) continue;
        const newC = await TaskComment.create({
          task_id: newTask.id,
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
          task_id: newTask.id,
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
    }

    await t.commit();

    emitBoardUpdate(req, targetBoardId, 'column_copied');
    if (String(targetBoardId) !== String(sourceColumn.board_id)) {
      emitBoardUpdate(req, sourceColumn.board_id, 'column_copied');
    }

    await logActivity({
      board_id: targetBoardId,
      user_id: req.user.id,
      task_id: null,
      action_type: 'COPY_COLUMN',
      details: { source_column_id: sourceColumn.id, source_board_id: sourceColumn.board_id, title: newTitle },
    });

    return res.status(201).json({ status: 'success', data: { column: newColumn } });
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    console.error('copyColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not copy column' });
  }
};
