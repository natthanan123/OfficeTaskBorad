(function () {
  const API_BASE   = window.APP_CONFIG.API_BASE;
  const LOGIN_PAGE = '../login_page_with_pawtry_logo/code.html';
  const token = localStorage.getItem('token');
  if (!token) { window.location.replace(LOGIN_PAGE); return; }

  const boardTitleEl = document.getElementById('board-title');
  const columnsEl    = document.getElementById('kanban-columns');
  const userNameEl   = document.getElementById('user-name');
  const userMenuBtn  = document.getElementById('user-menu');
  const boardListEl  = document.getElementById('board-list-container');
  const newBoardBtn  = document.getElementById('new-board-btn');
  const addColumnBtn = document.getElementById('add-column-btn');
  const inviteBtn    = document.getElementById('invite-btn');
  const invitePopup  = document.getElementById('invite-popup');
  const taskCache = new Map();
  const columnCache = new Map();

  const state = { activeBoardId: null, cachedBoards: [], boardLabelsCache: [], boardMembersCache: [], currentUserId: null, currentUserRole: null };

  async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
    if (body) opts.body = JSON.stringify(body);
    const url = `${API_BASE}${path}`;
    let res;
    try {
      res = await fetch(url, opts);
    } catch (netErr) {
      console.error(`[api] NETWORK FAIL ${method} ${url} —`, netErr.message,
        '(backend down? wrong API_ORIGIN? CORS? mixed-content?)');
      throw new Error('Network error: cannot reach API server');
    }
    if (res.status === 401) { localStorage.removeItem('token'); window.location.replace(LOGIN_PAGE); throw new Error('Unauthorized'); }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.status !== 'success') {
      const msg = payload.message || `Request failed (HTTP ${res.status})`;
      console.error(`[api] ${method} ${url} →`, res.status, msg);
      throw new Error(msg);
    }
    return payload.data;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function formatDueDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  }
  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
  function colorFor(str) {
    const palette = ['#3525cd', '#58579b', '#7e3000', '#a44100', '#4f46e5', '#454386'];
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  function stripHtml(html) {
    if (html == null) return '';
    const div = document.createElement('div');
    div.innerHTML = String(html);
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function renderTaskCard(task) {
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    const visibleAssignees = assignees.slice(0, 3);
    const overflow = assignees.length - visibleAssignees.length;
    const assigneeAvatars = visibleAssignees.map(u => {
      const pic = u.profile_picture || u.avatar_url;
      if (pic) return `<img src="${escapeHtml(coverSrc(pic))}" alt="${escapeHtml(u.full_name || u.email || '')}" title="${escapeHtml(u.full_name || u.email || '')}" class="w-6 h-6 rounded-full border border-surface object-cover"/>`;
      return `<div class="w-6 h-6 rounded-full border border-surface flex items-center justify-center text-[9px] font-bold text-white" style="background-color: ${colorFor(u.email || u.id || u.full_name)};" title="${escapeHtml(u.full_name || u.email)}">${escapeHtml(initials(u.full_name))}</div>`;
    }).join('');
    const overflowBadge = overflow > 0 ? `<div class="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center text-[10px] font-bold text-on-primary-fixed border border-surface">+${overflow}</div>` : '';
    const labels = Array.isArray(task.labels) ? task.labels : [];
    const labelsStrip = labels.length ? `<div class="flex flex-wrap gap-1 mb-2">${labels.map(l => `<span class="h-2 w-10 rounded-sm" style="background:${escapeHtml(l.color || '#6b7280')}" title="${escapeHtml(l.title || '')}"></span>`).join('')}</div>` : '';
    const dueLabel = formatDueDate(task.due_date);
    let dueBlock = '';
    if (task.is_completed) {
      dueBlock = `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-700"><span class="material-symbols-outlined text-xs">check_circle</span><span class="text-[10px] font-bold uppercase">${escapeHtml(dueLabel || 'Done')}</span></div>`;
    } else if (dueLabel) {
      dueBlock = `<div class="inline-flex items-center gap-1 text-slate-400"><span class="material-symbols-outlined text-xs">calendar_today</span><span class="text-[10px] font-medium uppercase">${escapeHtml(dueLabel)}</span></div>`;
    }
    const descPreview = stripHtml(task.description);
    const descBlock = descPreview ? `<p class="text-xs text-on-surface-variant mb-3 line-clamp-2">${escapeHtml(descPreview)}</p>` : '';
    const attachments = Array.isArray(task.attachments) ? task.attachments : [];
    const cover = attachments.find(a => a && a.is_cover && a.mimetype && a.mimetype.startsWith('image/'));
    const coverBlock = cover ? `<div class="-mx-4 -mt-4 mb-3 h-32 rounded-t-xl overflow-hidden bg-surface-container-high"><img src="${escapeHtml(coverSrc(cover.filename_or_url))}" alt="" class="w-full h-full object-cover pointer-events-none"/></div>` : '';
    return `<div class="task-card bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-transparent hover:border-primary/20 transition-all cursor-grab active:cursor-grabbing overflow-hidden" draggable="true" data-task-id="${escapeHtml(task.id)}" data-column-id="${escapeHtml(task.column_id)}">${coverBlock}${labelsStrip}<h4 class="font-bold text-on-surface leading-tight mb-2">${escapeHtml(task.title)}</h4>${descBlock}<div class="flex justify-between items-center mt-3 gap-2"><div class="flex -space-x-1">${assigneeAvatars}${overflowBadge}</div>${dueBlock}</div><div class="file-drop-overlay">Drop files to upload.</div></div>`;
  }

  function coverSrc(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (pathOrUrl.startsWith('/uploads/')) return `${window.APP_CONFIG.API_ORIGIN}${pathOrUrl}`;
    return pathOrUrl;
  }

  function renderBoard(board) {
    boardTitleEl.textContent = board.title || 'Untitled Board';
    document.title = `${board.title || 'Board'} | Pawtry`;
    const columns = Array.isArray(board.columns) ? [...board.columns] : [];
    columns.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (columns.length === 0) {
      columnsEl.innerHTML = `
        <button type="button" id="kanban-empty-add-column" class="flex-1 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer group">
          <div class="flex flex-col items-center gap-2 border-2 border-dashed border-outline/30 group-hover:border-primary/40 rounded-2xl px-12 py-10 transition-colors">
            <span class="material-symbols-outlined text-[40px] text-outline group-hover:text-primary">add_circle</span>
            <p class="text-sm font-semibold">Click to add your first column</p>
            <p class="text-[11px] opacity-60">or double-click anywhere on the empty area</p>
          </div>
        </button>`;
      return;
    }
    taskCache.clear();
    columnCache.clear();
    columns.forEach(col => { columnCache.set(String(col.id), col); (col.tasks || []).forEach(t => taskCache.set(String(t.id), t)); });
    const addColumnPlaceholder = `
      <button type="button" id="kanban-add-column-placeholder" class="kanban-add-column-placeholder shrink-0 self-start w-72 h-32 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-outline/30 hover:border-primary/50 hover:bg-primary/5 text-on-surface-variant/60 hover:text-primary transition-colors group" title="Click or double-click to add a new column">
        <span class="material-symbols-outlined text-[28px] group-hover:scale-110 transition-transform">add</span>
        <span class="text-xs font-medium">Add Column</span>
        <span class="text-[10px] opacity-60">(double-click empty area)</span>
      </button>`;
    columnsEl.innerHTML = columns.map(window.Dashboard.renderColumn).join('') + addColumnPlaceholder;
    window.Dashboard.setupDragAndDrop();
    attachCardClickEvents();
    attachAddTaskEvents();
    window.Dashboard.attachColumnOptionEvents();
    window.dispatchEvent(new CustomEvent('dashboard:board-loaded', { detail: { boardId: state.activeBoardId } }));
  }

  async function uploadTaskAttachment(taskId, file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/tasks/${taskId}/attachments`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
    if (res.status === 401) { localStorage.removeItem('token'); window.location.replace(LOGIN_PAGE); throw new Error('Unauthorized'); }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.status !== 'success') throw new Error(payload.message || `Upload failed (HTTP ${res.status})`);
    return payload.data;
  }

  function hasFilesPayload(dt) {
    if (!dt || !dt.types) return false;
    const types = dt.types;
    if (typeof types.includes === 'function') return types.includes('Files');
    for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true;
    return false;
  }

  function attachSingleCardFileDrop(card) {
    let depth = 0;
    card.addEventListener('dragenter', (e) => { if (!hasFilesPayload(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); depth++; card.classList.add('is-dragover'); });
    card.addEventListener('dragover', (e) => { if (!hasFilesPayload(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
    card.addEventListener('dragleave', (e) => { if (!hasFilesPayload(e.dataTransfer)) return; depth--; if (depth <= 0) { depth = 0; card.classList.remove('is-dragover'); } });
    card.addEventListener('drop', async (e) => {
      if (!hasFilesPayload(e.dataTransfer)) return;
      e.preventDefault(); e.stopPropagation(); depth = 0; card.classList.remove('is-dragover');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      const taskId = card.dataset.taskId;
      if (!taskId) return;
      let uploaded = 0;
      for (const file of files) {
        try { await uploadTaskAttachment(taskId, file); uploaded++; }
        catch (err) { if (err.message === 'Unauthorized') return; console.error('card drop upload failed:', err); showToast(err.message || 'Upload failed', 'error'); }
      }
      if (uploaded) { showToast(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`, 'attach_file'); if (state.activeBoardId) loadBoardData(state.activeBoardId); }
    });
  }

  function attachSingleCardEvents(card) {
    let didDrag = false;
    card.addEventListener('dragstart', () => { didDrag = true; });
    card.addEventListener('dragend', () => { setTimeout(() => { didDrag = false; }, 0); });
    card.addEventListener('click', (e) => {
      if (didDrag) return;
      if (e.target.closest('button, a, input, textarea, select')) return;
      if (window.Dashboard && window.Dashboard.openTaskModal) window.Dashboard.openTaskModal(card.dataset.taskId);
    });
    attachSingleCardFileDrop(card);
  }

  function attachSingleCardDrag(card) {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: card.dataset.taskId, sourceColumnId: card.dataset.columnId }));
      requestAnimationFrame(() => card.classList.add('task-card-dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('task-card-dragging');
      columnsEl.querySelectorAll('.column-drag-over').forEach(c => c.classList.remove('column-drag-over'));
    });
  }

  function attachCardClickEvents() { columnsEl.querySelectorAll('.task-card').forEach(card => { attachSingleCardEvents(card); }); }
  function attachAddTaskEvents() { columnsEl.querySelectorAll('.add-task-btn').forEach(btn => { btn.addEventListener('click', () => { if (window.Dashboard && window.Dashboard.openCreateModal) window.Dashboard.openCreateModal(btn.dataset.columnId); }); }); }

  function renderError(message) {
    boardTitleEl.textContent = 'Could not load board';
    columnsEl.innerHTML = `<div class="flex-1 flex items-center justify-center"><div class="flex flex-col items-center gap-3 max-w-md text-center"><span class="material-symbols-outlined text-error text-[40px]">error</span><p class="text-sm font-semibold text-on-surface">${escapeHtml(message)}</p><p class="text-xs text-on-surface-variant">ตรวจสอบว่า backend กำลังทำงานอยู่ที่ ${window.APP_CONFIG.API_ORIGIN} และมี board ในฐานข้อมูล</p></div></div>`;
  }

  //Retain scroll position across re-renders
  function snapshotScrollPositions() {
    const snap = {
      boardLeft: columnsEl.scrollLeft,
      boardTop:  columnsEl.scrollTop,
      columns:   {},
    };
    columnsEl.querySelectorAll('.kanban-column').forEach(colEl => {
      const id = colEl.dataset.columnId;
      const dz = colEl.querySelector('.kanban-drop-zone');
      if (id && dz) snap.columns[id] = dz.scrollTop;
    });
    return snap;
  }

  function restoreScrollPositions(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      columnsEl.scrollLeft = snap.boardLeft || 0;
      columnsEl.scrollTop  = snap.boardTop  || 0;
      Object.keys(snap.columns || {}).forEach(id => {
        const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${id}"]`);
        const dz = colEl && colEl.querySelector('.kanban-drop-zone');
        if (dz) dz.scrollTop = snap.columns[id];
      });
    });
  }

  async function loadBoardData(boardId) {
    if (!boardId) return;
    if (window.Dashboard && window.Dashboard.SocketManager) window.Dashboard.SocketManager.joinBoardRoom(boardId);
    const scrollSnap = snapshotScrollPositions();
    try {
      columnsEl.innerHTML = `<div class="flex-1 flex items-center justify-center text-on-surface-variant"><div class="flex flex-col items-center gap-3"><span class="material-symbols-outlined text-primary animate-spin text-[32px]">progress_activity</span><p class="text-sm font-medium">Loading board...</p></div></div>`;
      const [detail, labelsData, membersData] = await Promise.all([
        api(`/boards/${boardId}`),
        api(`/boards/${boardId}/labels`).catch(() => ({ labels: [] })),
        api(`/boards/${boardId}/members`).catch(() => ({ members: [] })),
      ]);
      state.boardLabelsCache  = Array.isArray(labelsData.labels)  ? labelsData.labels  : [];
      state.boardMembersCache = Array.isArray(membersData.members) ? membersData.members : [];
      renderBoard(detail.board);
      restoreScrollPositions(scrollSnap);
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to load board data:', err);
      renderError(err.message || 'Unknown error');
    }
  }

  async function bootstrapDashboard() {
    api('/users/me').then(d => {
      if (d && d.user) {
        userNameEl.textContent = d.user.full_name || d.user.email;
        state.currentUserId = d.user.id;
        state.currentUserRole = d.user.role || null;
        const pic = d.user.profile_picture || d.user.avatar_url;
        if (pic) {
          const resolved = coverSrc(pic);
          const headerImg  = document.querySelector('#user-menu img');
          const sidebarImg = document.getElementById('sidebar-user-avatar');
          if (headerImg)  headerImg.src  = resolved;
          if (sidebarImg) sidebarImg.src = resolved;
        }
        if (window.Dashboard && window.Dashboard.SocketManager) window.Dashboard.SocketManager.joinUserRoom(state.currentUserId);
      }
    }).catch(() => {});
    if (window.Dashboard.fetchNotifications) window.Dashboard.fetchNotifications();
    await window.Dashboard.loadBoards();
    if (state.cachedBoards.length === 0) {
      boardTitleEl.textContent = 'No boards yet';
      columnsEl.innerHTML = `<div class="flex-1 flex items-center justify-center text-on-surface-variant"><div class="flex flex-col items-center gap-2"><span class="material-symbols-outlined text-[32px] text-outline">dashboard_customize</span><p class="text-sm font-medium">No boards yet. Click "New Board" to create one.</p></div></div>`;
      return;
    }
    state.activeBoardId = state.cachedBoards[0].id;
    window.Dashboard.renderBoardList();
    await loadBoardData(state.activeBoardId);
  }

  inviteBtn.addEventListener('click', (e) => { e.stopPropagation(); invitePopup.classList.toggle('hidden'); });
  document.addEventListener('click', (e) => {
    if (invitePopup.classList.contains('hidden')) return;
    if (invitePopup.contains(e.target) || inviteBtn.contains(e.target)) return;
    invitePopup.classList.add('hidden');
  });

  const inviteEmailInput = document.getElementById('invite-email-input');
  const submitInviteBtn  = document.getElementById('submit-invite-btn');
  async function submitInvite() {
    if (!state.activeBoardId) { alert('Please select or create a board first'); return; }
    const email = inviteEmailInput.value.trim();
    if (!email) { alert('Please enter an email address'); inviteEmailInput.focus(); return; }
    submitInviteBtn.disabled = true;
    const originalLabel = submitInviteBtn.textContent;
    submitInviteBtn.textContent = 'Sending...';
    try {
      await api(`/boards/${state.activeBoardId}/invite`, { method: 'POST', body: { email } });
      alert('Invitation sent successfully!');
      inviteEmailInput.value = '';
      invitePopup.classList.add('hidden');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to send invite:', err);
      alert(err.message || 'Could not send invitation');
    } finally {
      submitInviteBtn.disabled = false;
      submitInviteBtn.textContent = originalLabel;
    }
  }
  submitInviteBtn.addEventListener('click', submitInvite);
  inviteEmailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitInvite(); } });

  const toastContainerEl = document.getElementById('toast-container');
  function showToast(message, icon = 'notifications') {
    if (!toastContainerEl) return;
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-2 bg-on-surface text-surface-container-lowest px-4 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-xs animate-[fadeIn_0.2s_ease-out]';
    toast.innerHTML = `<span class="material-symbols-outlined text-base shrink-0">${escapeHtml(icon)}</span><span class="flex-1">${escapeHtml(message)}</span>`;
    toastContainerEl.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(24px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  userMenuBtn.addEventListener('click', () => {
    if (confirm('Logout from Pawtry?')) { localStorage.removeItem('token'); window.location.replace(LOGIN_PAGE); }
  });

  window.Dashboard = {
    api, escapeHtml, showToast, formatDueDate, initials, colorFor, coverSrc,
    LOGIN_PAGE, state, loadBoardData,
    getActiveBoardId: () => state.activeBoardId,
    getCurrentUserId: () => state.currentUserId,
    getColumnById: (id) => columnCache.get(String(id)) || null,
    getTaskById:   (id) => taskCache.get(String(id)) || null,
    getLabelById:  (id) => state.boardLabelsCache.find(l => String(l.id) === String(id)) || null,
    getMemberById: (id) => state.boardMembersCache.find(u => String(u.id) === String(id)) || null,
    taskCache, columnCache,
    getBoardLabelsCache:  () => state.boardLabelsCache,
    getBoardMembersCache: () => state.boardMembersCache,
    getColumnsEl:    () => columnsEl,
    getUserNameEl:   () => userNameEl,
    getBoardTitleEl: () => boardTitleEl,
    getBoardListEl:  () => boardListEl,
    getNewBoardBtn:  () => newBoardBtn,
    getAddColumnBtn: () => addColumnBtn,
    renderTaskCard, attachSingleCardEvents, attachSingleCardDrag, attachSingleCardFileDrop,
    uploadTaskAttachment, hasFilesPayload,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapDashboard);
  else setTimeout(bootstrapDashboard, 0);
})();
