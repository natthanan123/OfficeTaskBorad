const { User, Notification } = require('../models');

/**
 * Parse mentions from HTML content.
 * Expected format: <span data-mention="user-uuid">@Display Name</span>
 * Returns an array of unique user IDs that were mentioned.
 */
function extractMentionedUserIds(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];
  const ids = new Set();
  // Match data-mention="uuid"
  const regex = /data-mention="([a-f0-9\-]+)"/gi;
  let m;
  while ((m = regex.exec(htmlContent)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return Array.from(ids);
}

/**
 * Given a comment's content, find mentioned users, create Notifications
 * and emit socket events to notify them in real-time.
 *
 * @param {object} opts
 * @param {string} opts.content - comment HTML content
 * @param {string} opts.commentId
 * @param {string} opts.taskId
 * @param {string} opts.authorId - user_id of the commenter (won't notify self)
 * @param {object} opts.req - Express req (used to emit socket events)
 */
async function processMentionsForComment({ content, commentId, taskId, authorId, req }) {
  try {
    const mentionedIds = extractMentionedUserIds(content);
    if (!mentionedIds.length) return;

    // Filter: don't notify the commenter themselves
    const targetIds = mentionedIds.filter(id => String(id) !== String(authorId));
    if (!targetIds.length) return;

    // Verify users exist (avoid fake UUIDs from manipulated HTML)
    const users = await User.findAll({
      where: { id: targetIds },
      attributes: ['id'],
    });
    const validIds = users.map(u => String(u.id));

    for (const userId of validIds) {
      try {
        const notification = await Notification.create({
          user_id: userId,
          type: 'comment_mention',
          message: 'You were mentioned in a comment',
          reference_id: commentId,
        });
        if (req) {
          try {
            req.app.get('io').to(`user_${userId}`).emit('new_notification', { notification });
          } catch (socketErr) {
            console.error('socket emit (mention notification) failed:', socketErr);
          }
        }
      } catch (notifErr) {
        console.error('create mention notification failed:', notifErr);
      }
    }
  } catch (err) {
    console.error('processMentionsForComment error:', err);
  }
}

module.exports = {
  extractMentionedUserIds,
  processMentionsForComment,
};
