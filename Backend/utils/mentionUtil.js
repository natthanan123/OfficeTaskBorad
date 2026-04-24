const { User, Notification } = require('../models');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENTION_ATTR_RE = /data-mention\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

function extractMentionedUserIds(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];
  const ids = new Set();
  let m;
  MENTION_ATTR_RE.lastIndex = 0;
  while ((m = MENTION_ATTR_RE.exec(htmlContent)) !== null) {
    const raw = (m[1] || m[2] || '').trim();
    if (raw && UUID_RE.test(raw)) ids.add(raw);
  }
  return Array.from(ids);
}
async function processMentionsForComment({ content, commentId, authorId, req }) {
  try {
    const mentionedIds = extractMentionedUserIds(content);
    if (!mentionedIds.length) return;

    const targetIds = mentionedIds.filter(id => String(id) !== String(authorId));
    if (!targetIds.length) return;

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
