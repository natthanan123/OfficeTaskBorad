const { TaskComment, Task, Column, User } = require('../models');
const { parseUrlsToAttachments } = require('../utils/parseUrlsToAttachments');
const { processMentionsForComment, extractMentionedUserIds } = require('../utils/mentionUtil');

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

function canMutate(req, comment) {
  return req.user.role === 'admin' || comment.user_id === req.user.id;
}

exports.updateComment = async (req, res) => {
  try {
    const comment = await TaskComment.findByPk(req.params.id);
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    if (!canMutate(req, comment)) {
      return res.status(403).json({ status: 'error', message: 'You can only edit your own comments' });
    }

    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ status: 'error', message: 'content is required' });
    }

    // Find new mentions (ones that weren't in the original content)
    const oldMentions = new Set(extractMentionedUserIds(comment.content));
    const newMentions = extractMentionedUserIds(content);
    const freshMentions = newMentions.filter(id => !oldMentions.has(id));

    comment.content = content.trim();
    await comment.save();

    const fresh = await TaskComment.findByPk(comment.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email'] },
    });

    const boardId = await resolveBoardIdForComment(comment);
    emitBoardUpdate(req, boardId, 'task_comment_updated');

    await parseUrlsToAttachments(comment.content, comment.task_id, 'comment', req.user.id);

    // Only notify NEW mentions (avoid spamming existing mentions on every edit)
    if (freshMentions.length) {
      // Reconstruct a content-like string that only has new mentions,
      // so processMentionsForComment only notifies those users.
      const fakeContent = freshMentions.map(id => `<span data-mention="${id}">@user</span>`).join(' ');
      await processMentionsForComment({
        content: fakeContent,
        commentId: comment.id,
        taskId: comment.task_id,
        authorId: req.user.id,
        req,
      });
    }

    return res.json({ status: 'success', data: { comment: fresh } });
  } catch (err) {
    console.error('updateComment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update comment' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await TaskComment.findByPk(req.params.id);
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    if (!canMutate(req, comment)) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own comments' });
    }

    const boardId = await resolveBoardIdForComment(comment);
    await comment.destroy();

    emitBoardUpdate(req, boardId, 'task_comment_deleted');

    return res.json({ status: 'success', data: { id: req.params.id } });
  } catch (err) {
    console.error('deleteComment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete comment' });
  }
};
