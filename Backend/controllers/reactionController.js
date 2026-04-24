const { TaskComment, CommentReaction, Task, Column } = require('../models');
const EMOJI_MAX_LEN = 16;

function isForbiddenEmojiChar(code) {
  if (code < 0x20 || code === 0x7f) return true;
  if (code === 0x3c || code === 0x3e) return true;
  if (code === 0x26) return true;
  if (code === 0x22 || code === 0x27) return true;
  if (code === 0x60 || code === 0x5c) return true;
  return false;
}

function normalizeEmoji(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > EMOJI_MAX_LEN) return null;
  for (let i = 0; i < trimmed.length; i++) {
    if (isForbiddenEmojiChar(trimmed.charCodeAt(i))) return null;
  }
  return trimmed;
}

function emitBoardUpdate(req, boardId, type) {
  if (!boardId) return;
  try {
    req.app.get('io').to(`board_${boardId}`).emit('board_updated', { type, board_id: boardId });
  } catch (socketErr) {
    console.error(`socket emit (${type}) failed:`, socketErr);
  }
}

async function resolveBoardIdForComment(comment) {
  if (!comment) return null;
  const task = await Task.findByPk(comment.task_id);
  if (!task) return null;
  const column = await Column.findByPk(task.column_id);
  return column ? column.board_id : null;
}

function groupReactions(rows) {
  const grouped = {};
  rows.forEach(r => {
    const emoji = r.emoji;
    if (!grouped[emoji]) grouped[emoji] = { emoji, count: 0, user_ids: [] };
    grouped[emoji].count++;
    grouped[emoji].user_ids.push(r.user_id);
  });
  return Object.values(grouped);
}

exports.toggleReaction = async (req, res) => {
  try {
    const commentId = req.params.id;
    const emoji = normalizeEmoji(req.body && req.body.emoji);
    if (!emoji) {
      return res.status(400).json({ status: 'error', message: 'emoji is required' });
    }

    const comment = await TaskComment.findByPk(commentId);
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    const existing = await CommentReaction.findOne({
      where: { comment_id: commentId, user_id: req.user.id, emoji },
    });

    let reacted;
    if (existing) {
      await existing.destroy();
      reacted = false;
    } else {
      await CommentReaction.create({
        comment_id: commentId,
        user_id: req.user.id,
        emoji,
      });
      reacted = true;
    }

    const allReactions = await CommentReaction.findAll({
      where: { comment_id: commentId },
      attributes: ['id', 'emoji', 'user_id', 'created_at'],
    });

    const boardId = await resolveBoardIdForComment(comment);
    emitBoardUpdate(req, boardId, 'task_comment_reaction_toggled');

    return res.json({
      status: 'success',
      data: {
        comment_id: commentId,
        emoji,
        reacted,
        reactions: groupReactions(allReactions),
      },
    });
  } catch (err) {
    console.error('toggleReaction error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not toggle reaction' });
  }
};

/**
 * GET /api/comments/:id/reactions
 */
exports.listReactions = async (req, res) => {
  try {
    const rows = await CommentReaction.findAll({
      where: { comment_id: req.params.id },
      attributes: ['id', 'emoji', 'user_id', 'created_at'],
    });
    return res.json({
      status: 'success',
      data: { reactions: groupReactions(rows) },
    });
  } catch (err) {
    console.error('listReactions error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch reactions' });
  }
};
