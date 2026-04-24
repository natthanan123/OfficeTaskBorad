(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[TaskCommentRender] window.Dashboard is missing');
    return;
  }

  const escapeHtml = D.escapeHtml;
  const initials   = D.initials;
  const colorFor   = D.colorFor;
  const coverSrc   = D.coverSrc;

  // Own-vs-other detection
  function isOwnComment(comment) {
    const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
    if (!comment) return false;

    if (comment.author && comment.author.id && currentUserId) {
      if (String(comment.author.id) === String(currentUserId)) return true;
    }
    if (comment.user_id && currentUserId) {
      if (String(comment.user_id) === String(currentUserId)) return true;
    }
    if (comment.author && comment.author.email) {
      const userNameEl = D.getUserNameEl && D.getUserNameEl();
      const me = D.state && D.state.currentUser;
      if (me && me.email && String(comment.author.email).toLowerCase() === String(me.email).toLowerCase()) return true;
      if (userNameEl && comment.author.full_name && userNameEl.textContent.trim() === comment.author.full_name.trim()) return true;
      if (userNameEl && comment.author.email && userNameEl.textContent.trim() === comment.author.email.trim()) return true;
    }
    return false;
  }

  // Timestamp formatter
  function formatCommentTimestamp(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
    } catch (e) { return ''; }
  }

  // Comment body — allow stored HTML (already sanitized server-side)
  function renderCommentContent(content) {
    if (!content) return '';
    if (content.startsWith('<')) return content;
    return escapeHtml(content);
  }

  // Reactions row
  function renderReactionsRow(c) {
    const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
    const reactions = Array.isArray(c.reactions) ? c.reactions : [];
    const pills = reactions.map(r => {
      const isMine = currentUserId && Array.isArray(r.user_ids) && r.user_ids.some(uid => String(uid) === String(currentUserId));
      return `<button type="button" class="pawtry-reaction-pill ${isMine ? 'is-mine' : ''}" data-reaction-toggle data-comment-id="${escapeHtml(String(c.id))}" data-emoji="${escapeHtml(r.emoji)}">
        <span class="pawtry-reaction-emoji">${escapeHtml(r.emoji)}</span>
        <span class="pawtry-reaction-count">${r.count}</span>
      </button>`;
    }).join('');

    const pickerBtn = `<button type="button" class="pawtry-reaction-picker-btn" data-reaction-picker data-comment-id="${escapeHtml(String(c.id))}" title="Add reaction">
      <span class="material-symbols-outlined">mood</span>
    </button>`;

    return `<div class="pawtry-reactions-row">${pills}${pickerBtn}</div>`;
  }

  // Single comment item
  function renderCommentItem(c, depth) {
    depth = depth || 0;
    const author = (c.author && (c.author.full_name || c.author.email)) || 'Unknown';
    const when = formatCommentTimestamp(c.created_at);
    const pic = c.author && (c.author.profile_picture || c.author.avatar_url);
    const avatarSize = depth > 0 ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[11px]';
    const avatar = pic
      ? `<img src="${escapeHtml(coverSrc(pic))}" alt="${escapeHtml(author)}" class="${avatarSize} rounded-full object-cover flex-shrink-0"/>`
      : `<div class="${avatarSize} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style="background:${colorFor(author)}">${escapeHtml(initials(author))}</div>`;

    const isOwn = isOwnComment(c);
    const isEdited = !!c.updated_at && c.updated_at !== c.created_at;
    const editedBadge = isEdited ? ' <span class="pawtry-comment-edited">(edited)</span>' : '';
    const editedTooltip = isEdited && c.updated_at ? ` title="Edited ${escapeHtml(formatCommentTimestamp(c.updated_at))}"` : '';
    const reactionsHtml = renderReactionsRow(c);
    const actionsHtml = isOwn
      ? `<div class="pawtry-comment-actions">
           <button type="button" class="pawtry-comment-action-btn" data-comment-action="edit" data-comment-id="${escapeHtml(String(c.id))}">แก้ไข</button>
           <span class="pawtry-comment-action-sep">•</span>
           <button type="button" class="pawtry-comment-action-btn is-danger" data-comment-action="delete" data-comment-id="${escapeHtml(String(c.id))}">ลบ</button>
         </div>`
      : `<div class="pawtry-comment-actions">
           <button type="button" class="pawtry-comment-action-btn" data-comment-action="reply" data-comment-id="${escapeHtml(String(c.id))}">ตอบกลับ</button>
         </div>`;

    const depthClass = depth > 0 ? `pawtry-reply-item pawtry-reply-depth-${depth}` : '';
    const indentPx = depth >= 3 ? 144 : depth * 48;
    const indentStyle = depth > 0 ? ` style="margin-left:${indentPx}px"` : '';

    return `<li class="flex gap-3 ${depthClass}"${indentStyle} data-comment-item="${escapeHtml(String(c.id))}" data-comment-depth="${depth}">
        ${avatar}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-sm font-semibold text-gray-800">${escapeHtml(author)}</span>
            <a href="#comment-${escapeHtml(String(c.id))}" class="pawtry-comment-timestamp" data-comment-id="${escapeHtml(String(c.id))}"${editedTooltip}>${escapeHtml(when)}</a>${editedBadge}
          </div>
          <div class="mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 break-words overflow-visible" data-comment-body="${escapeHtml(String(c.id))}">${renderCommentContent(c.content)}</div>
          <div class="pawtry-comment-footer">
            ${reactionsHtml}
            ${actionsHtml}
          </div>
        </div>
      </li>`;
  }

  // Thread (parent -> children)
  function renderCommentThread(comments) {
    if (!Array.isArray(comments) || !comments.length) return '';

    const byId = new Map();
    const childrenByParent = new Map();
    comments.forEach(c => {
      byId.set(String(c.id), c);
      const pid = c.parent_id ? String(c.parent_id) : null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(c);
    });

    childrenByParent.forEach(arr => arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    }));

    function renderBranch(c, depth) {
      const cappedDepth = Math.min(depth, 2);
      let html = renderCommentItem(c, cappedDepth);
      const kids = childrenByParent.get(String(c.id)) || [];
      kids.forEach(k => { html += renderBranch(k, depth + 1); });
      return html;
    }

    const roots = childrenByParent.get(null) || [];
    comments.forEach(c => {
      if (c.parent_id && !byId.has(String(c.parent_id))) {
        if (!roots.includes(c)) roots.push(c);
      }
    });
    roots.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    return roots.map(r => renderBranch(r, 0)).join('');
  }

  D.isOwnComment           = isOwnComment;
  D.formatCommentTimestamp = formatCommentTimestamp;
  D.renderCommentContent   = renderCommentContent;
  D.renderReactionsRow     = renderReactionsRow;
  D.renderCommentItem      = renderCommentItem;
  D.renderCommentThread    = renderCommentThread;
})();
