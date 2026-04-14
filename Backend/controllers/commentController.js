const { TaskComment, Task, Column, User } = require('../models');
const { parseUrlsToAttachments } = require('../utils/parseUrlsToAttachments');

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

// PUT /api/comments/:id — update content. Re-parses URLs so newly added
// links become attachments just like the initial POST.
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

    comment.content = content.trim();
    await comment.save();

    // Reload with author so the client can re-render without another call.
    const fresh = await TaskComment.findByPk(comment.id, {
      include: { model: User, as: 'author', attributes: ['id', 'full_name', 'email'] },
    });

    const boardId = await resolveBoardIdForComment(comment);
    emitBoardUpdate(req, boardId, 'task_comment_updated');

    // New links typed into the edited comment become attachments (dedup
    // guards against re-inserting URLs that were already parsed earlier).
    await parseUrlsToAttachments(comment.content, comment.task_id, 'comment', req.user.id);

    return res.json({ status: 'success', data: { comment: fresh } });
  } catch (err) {
    console.error('updateComment error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update comment' });
  }
};

// DELETE /api/comments/:id — owner or admin only.
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
