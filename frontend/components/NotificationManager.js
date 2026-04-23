(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[NotificationManager] window.Dashboard is missing — script order?');
    return;
  }

  const api        = D.api;
  const escapeHtml = D.escapeHtml;

  const notificationBtn     = document.getElementById('notification-btn');
  const notificationPopup   = document.getElementById('notification-popup');
  const notificationBadge   = document.getElementById('notification-badge');
  const notificationListEl  = document.getElementById('notification-list');
  const notificationSummary = document.getElementById('notification-summary');

  if (!notificationBtn || !notificationPopup || !notificationListEl) {
    console.error('[NotificationManager] Required DOM elements missing.');
    return;
  }

  let cachedNotifications = [];
  let unreadCount         = 0;

  function formatNotificationTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7)   return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  }

  function updateNotificationBadge(count) {
    unreadCount = Math.max(0, count);
    if (unreadCount === 0) {
      notificationBadge.classList.add('hidden');
      notificationBadge.textContent = '';
    } else {
      notificationBadge.classList.remove('hidden');
      notificationBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    }
  }

  function renderNotificationItem(n) {
    const unread  = !n.is_read;
    const icon    = n.type === 'board_invite' ? 'group_add' : 'notifications';
    const timeStr = formatNotificationTime(n.created_at);
    const fullWhen = n.created_at
      ? new Date(n.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';

    let actionsHtml = '';
    if (n.type === 'board_invite' && n.reference_id) {
      const refId   = escapeHtml(n.reference_id);
      const notifId = escapeHtml(n.id);
      actionsHtml = `
        <div class="flex gap-2 mt-2">
          <button type="button" class="invite-respond-btn px-3 py-1 bg-primary text-on-primary text-xs font-semibold rounded-full hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  data-action="accepted" data-board-id="${refId}" data-notification-id="${notifId}">
            Accept
          </button>
          <button type="button" class="invite-respond-btn px-3 py-1 bg-surface-container-high text-on-surface text-xs font-semibold rounded-full hover:bg-error-container hover:text-on-error-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-action="rejected" data-board-id="${refId}" data-notification-id="${notifId}">
            Reject
          </button>
        </div>
      `;
    }

    const unreadBgClass = unread ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : '';
    const msgClasses    = unread
      ? 'font-semibold text-on-surface'
      : 'text-on-surface-variant';

    return `
      <li data-notification-id="${escapeHtml(n.id)}"
          data-is-read="${unread ? 'false' : 'true'}"
          class="notification-item border-b border-outline-variant/10 last:border-b-0 px-4 py-3 hover:bg-surface-container-low transition-colors cursor-pointer ${unreadBgClass}">
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary text-base mt-0.5 shrink-0">${icon}</span>
          <div class="flex-1 min-w-0">
            <p class="notification-message text-sm leading-snug ${msgClasses}">
              ${escapeHtml(n.message || '')}
              ${fullWhen ? `<span class="text-[10px] text-on-surface-variant/50 ml-2 whitespace-nowrap">${escapeHtml(fullWhen)}</span>` : ''}
            </p>
            ${timeStr ? `<p class="text-[10px] text-on-surface-variant/70 mt-0.5">${escapeHtml(timeStr)}</p>` : ''}
            ${actionsHtml}
          </div>
          ${unread ? '<span class="unread-dot w-2 h-2 rounded-full bg-error mt-1.5 shrink-0"></span>' : ''}
        </div>
      </li>
    `;
  }

  function renderNotifications() {
    if (cachedNotifications.length === 0) {
      notificationListEl.innerHTML = `
        <li class="px-4 py-10 text-xs text-center text-on-surface-variant italic">
          No notifications yet
        </li>
      `;
      notificationSummary.textContent = '';
      updateNotificationBadge(0);
      return;
    }

    notificationListEl.innerHTML = cachedNotifications.map(renderNotificationItem).join('');

    const unread = cachedNotifications.filter(n => !n.is_read).length;
    updateNotificationBadge(unread);
    notificationSummary.textContent = unread > 0 ? `${unread} unread` : 'All read';

    notificationListEl.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => handleNotificationClick(item));
    });
    notificationListEl.querySelectorAll('.invite-respond-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleInviteRespond(btn);
      });
    });
  }

  async function handleNotificationClick(item) {
    const id     = item.dataset.notificationId;
    const isRead = item.dataset.isRead === 'true';
    if (!id || isRead) return;

    try {
      await api(`/notifications/${id}/read`, { method: 'PUT' });

      item.dataset.isRead = 'true';
      item.classList.remove('bg-indigo-50/40', 'dark:bg-indigo-900/10');
      const msg = item.querySelector('.notification-message');
      if (msg) {
        msg.classList.remove('font-semibold', 'text-on-surface');
        msg.classList.add('text-on-surface-variant');
      }
      const dot = item.querySelector('.unread-dot');
      if (dot) dot.remove();

      const cached = cachedNotifications.find(n => String(n.id) === String(id));
      if (cached) cached.is_read = true;
      updateNotificationBadge(unreadCount - 1);
      const stillUnread = Math.max(0, unreadCount);
      notificationSummary.textContent = stillUnread > 0 ? `${stillUnread} unread` : 'All read';
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to mark notification as read:', err);
    }
  }

  async function handleInviteRespond(btn) {
    const action  = btn.dataset.action;
    const boardId = btn.dataset.boardId;
    const notifId = btn.dataset.notificationId;
    if (!boardId || !['accepted', 'rejected'].includes(action)) return;

    const parent  = btn.closest('.notification-item');
    const buttons = parent ? parent.querySelectorAll('.invite-respond-btn') : [btn];
    buttons.forEach(b => b.disabled = true);

    try {
      await api(`/boards/${boardId}/invite/respond`, {
        method: 'PUT',
        body: { status: action },
      });
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.warn('Invite respond error (auto-dismiss):', err.message);
    }

    // ── ลบ notification ออกจาก cache และ DOM ทันที เสมอ ──
    cachedNotifications = cachedNotifications.filter(n => String(n.id) !== String(notifId));
    if (parent) parent.remove();

    const unread = cachedNotifications.filter(n => !n.is_read).length;
    updateNotificationBadge(unread);
    notificationSummary.textContent = unread > 0 ? `${unread} unread` : 'All read';

    if (cachedNotifications.length === 0) {
      notificationListEl.innerHTML = `
        <li class="px-4 py-10 text-xs text-center text-on-surface-variant italic">
          No notifications yet
        </li>
      `;
    }

    // ── โหลด board list ใหม่โดยไม่เปลี่ยน active board ──
    if (action === 'accepted') {
      try {
        const data = await D.api('/boards');
        if (data && data.boards) {
          D.state.cachedBoards = data.boards;
          if (D.renderBoardList) D.renderBoardList();
        }
      } catch (e) { /* ignore */ }
    }
  }

  async function fetchNotifications() {
    try {
      const data = await api('/notifications');
      cachedNotifications = (data && data.notifications) || [];
      renderNotifications();
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to fetch notifications:', err);
      notificationListEl.innerHTML = `
        <li class="px-4 py-6 text-xs text-center text-error italic">
          Could not load notifications
        </li>
      `;
      notificationSummary.textContent = '';
      updateNotificationBadge(0);
    }
  }

  notificationBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notificationPopup.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (notificationPopup.classList.contains('hidden')) return;
    if (notificationPopup.contains(e.target) || notificationBtn.contains(e.target)) return;
    notificationPopup.classList.add('hidden');
  });

  window.Dashboard.fetchNotifications     = fetchNotifications;
  window.Dashboard.formatNotificationTime = formatNotificationTime;
})();