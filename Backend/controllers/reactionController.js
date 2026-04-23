const { TaskComment, CommentReaction, Task, Column } = require('../models');

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

/**
 * Toggle a reaction on a comment.
 * If user has already reacted with this emoji → remove it.
 * Otherwise → add it.
 * POST /api/comments/:id/reactions  body: { emoji }
 */
exports.toggleReaction = async (req, res) => {
  try {
    const commentId = req.params.id;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string' || !emoji.trim()) {
      return res.status(400).json({ status: 'error', message: 'emoji is required' });
    }

    const comment = await TaskComment.findByPk(commentId);
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    const trimmedEmoji = emoji.trim();

    const existing = await CommentReaction.findOne({
      where: {
        comment_id: commentId,
        user_id: req.user.id,
        emoji: trimmedEmoji,
      },
    });

    let reacted;
    if (existing) {
      await existing.destroy();
      reacted = false;
    } else {
      await CommentReaction.create({
        comment_id: commentId,
        user_id: req.user.id,
        emoji: trimmedEmoji,
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
        emoji: trimmedEmoji,
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
