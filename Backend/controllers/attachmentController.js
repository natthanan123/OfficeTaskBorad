const fs = require('fs');
const path = require('path');
const { Attachment, Task, Column, BoardMember, sequelize } = require('../models');

function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

async function resolveBoardIdForTask(taskId) {
  const task = await Task.findByPk(taskId);
  if (!task) return { task: null, boardId: null };
  const column = await Column.findByPk(task.column_id);
  return { task, boardId: column ? column.board_id : null };
}

// Caller must already be the board creator, admin, or an accepted member.
async function assertBoardAccess(req, boardId) {
  if (!boardId) return false;
  if (req.user.role === 'admin') return true;
  const membership = await BoardMember.findOne({
    where: { user_id: req.user.id, board_id: boardId, status: 'accepted' },
  });
  if (membership) return true;
  // Fall back to creator check (mirrors getBoards' visibility rules).
  const { Board } = require('../models');
  const board = await Board.findByPk(boardId);
  return !!(board && board.creator_id === req.user.id);
}

// POST /api/tasks/:task_id/attachments — direct file upload (multipart).
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file provided' });
    }

    const taskId = req.params.task_id;
    const { task, boardId } = await resolveBoardIdForTask(taskId);
    if (!task) {
      // Best-effort cleanup of the orphan upload before returning 404.
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    if (!(await assertBoardAccess(req, boardId))) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const attachment = await Attachment.create({
      task_id:         task.id,
      user_id:         req.user.id,
      filename_or_url: `/uploads/attachments/${req.file.filename}`,
      mimetype:        req.file.mimetype,
      size:            req.file.size,
      is_cover:        false,
      source:          'direct_upload',
    });

    emitBoardUpdate(req, boardId, 'attachment_added');

    return res.status(201).json({ status: 'success', data: { attachment } });
  } catch (err) {
    console.error('uploadAttachment error:', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    return res.status(500).json({ status: 'error', message: 'Could not upload attachment' });
  }
};

// POST /api/tasks/:task_id/attachments/link — add an arbitrary URL as a link.
exports.addLinkAttachment = async (req, res) => {
  try {
    const taskId = req.params.task_id;
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ status: 'error', message: 'A valid http(s) url is required' });
    }

    const { task, boardId } = await resolveBoardIdForTask(taskId);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    if (!(await assertBoardAccess(req, boardId))) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    // De-dup: if the URL is already attached to this task, return the
    // existing row rather than creating a duplicate.
    const trimmed = url.trim();
    const existing = await Attachment.findOne({
      where: { task_id: task.id, filename_or_url: trimmed },
    });
    if (existing) {
      return res.status(200).json({ status: 'success', data: { attachment: existing, duplicate: true } });
    }

    const { guessMimetype } = require('../utils/parseUrlsToAttachments');
    const attachment = await Attachment.create({
      task_id:         task.id,
      user_id:         req.user.id,
      filename_or_url: trimmed,
      mimetype:        guessMimetype(trimmed),
      size:            null,
      is_cover:        false,
      source:          'direct_upload',
    });

    emitBoardUpdate(req, boardId, 'attachment_added');

    return res.status(201).json({ status: 'success', data: { attachment } });
  } catch (err) {
    console.error('addLinkAttachment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not add link' });
  }
};

// GET /api/tasks/:task_id/attachments
exports.listAttachments = async (req, res) => {
  try {
    const taskId = req.params.task_id;
    const { task, boardId } = await resolveBoardIdForTask(taskId);
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    if (!(await assertBoardAccess(req, boardId))) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const attachments = await Attachment.findAll({
      where: { task_id: task.id },
      order: [['created_at', 'DESC']],
    });

    return res.json({ status: 'success', data: { attachments } });
  } catch (err) {
    console.error('listAttachments error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch attachments' });
  }
};

// PUT /api/attachments/:id/set_cover — clears other covers first.
exports.setCover = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const attachment = await Attachment.findByPk(req.params.id, { transaction: t });
    if (!attachment) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Attachment not found' });
    }

    if (!attachment.mimetype || !attachment.mimetype.startsWith('image/')) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Only image attachments can be set as cover' });
    }

    const { boardId } = await resolveBoardIdForTask(attachment.task_id);
    if (!(await assertBoardAccess(req, boardId))) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    // Atomic swap: clear all covers on this task, then set the new one.
    await Attachment.update(
      { is_cover: false },
      { where: { task_id: attachment.task_id }, transaction: t }
    );
    attachment.is_cover = true;
    await attachment.save({ transaction: t });

    await t.commit();

    emitBoardUpdate(req, boardId, 'attachment_cover_changed');

    return res.json({ status: 'success', data: { attachment } });
  } catch (err) {
    await t.rollback();
    console.error('setCover error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not set cover' });
  }
};

// DELETE /api/attachments/:id
exports.deleteAttachment = async (req, res) => {
  try {
    const attachment = await Attachment.findByPk(req.params.id);
    if (!attachment) {
      return res.status(404).json({ status: 'error', message: 'Attachment not found' });
    }

    const { boardId } = await resolveBoardIdForTask(attachment.task_id);
    if (!(await assertBoardAccess(req, boardId))) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    const storedPath = attachment.filename_or_url;
    const taskId     = attachment.task_id;

    await attachment.destroy();

    // Best-effort: delete the underlying file for direct uploads.
    if (attachment.source === 'direct_upload' && storedPath && storedPath.startsWith('/uploads/')) {
      const abs = path.join(__dirname, '..', storedPath.replace(/^\//, ''));
      fs.unlink(abs, () => { /* swallow — file may already be gone */ });
    }

    emitBoardUpdate(req, boardId, 'attachment_deleted');

    return res.json({ status: 'success', data: { id: req.params.id, task_id: taskId } });
  } catch (err) {
    console.error('deleteAttachment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete attachment' });
  }
};
