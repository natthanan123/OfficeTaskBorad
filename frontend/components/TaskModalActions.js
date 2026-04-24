(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[TaskModalActions] window.Dashboard is missing');
    return;
  }
  if (!D.TaskModal) {
    console.error('[TaskModalActions] D.TaskModal is missing — load order?');
    return;
  }

  const api           = D.api;
  const escapeHtml    = D.escapeHtml;
  const showToast     = D.showToast;
  const taskCache     = D.taskCache;
  const getColumnsEl  = D.getColumnsEl;
  const renderTaskCard = D.renderTaskCard;
  const attachSingleCardEvents = D.attachSingleCardEvents;
  const attachSingleCardDrag   = D.attachSingleCardDrag;
  const updateColumnBadge = D.updateColumnBadge;

  const modalMoreBtn       = document.getElementById('modal-more-btn');
  const modalMoreMenu      = document.getElementById('modal-more-menu');
  const modalMoveMenu      = document.getElementById('modal-move-menu');
  const modalMoveList      = document.getElementById('modal-move-list');
  const modalMoveBack      = document.getElementById('modal-move-back');
  const modalCopyMenu      = document.getElementById('modal-copy-menu');
  const modalCopyBack      = document.getElementById('modal-copy-back');
  const modalCopyTitle     = document.getElementById('modal-copy-title');
  const modalCopyColumn    = document.getElementById('modal-copy-column');
  const modalCopySubmit    = document.getElementById('modal-copy-submit');
  const modalShareMenu     = document.getElementById('modal-share-menu');
  const modalShareBack     = document.getElementById('modal-share-back');
  const modalShareUrl      = document.getElementById('modal-share-url');
  const modalShareCopy     = document.getElementById('modal-share-copy');
  const modalShareFeedback = document.getElementById('modal-share-feedback');
  const modalStatus        = document.getElementById('modal-status');

  function currentTaskId()   { return D.TaskModal.getActiveTaskId(); }
  function currentTask()     { const id = currentTaskId(); return id ? taskCache.get(id) : null; }

  // Menu show/hide
  function closeMoreMenu() {
    if (modalMoreMenu)  modalMoreMenu.classList.add('hidden');
    if (modalMoveMenu)  modalMoveMenu.classList.add('hidden');
    if (modalCopyMenu)  modalCopyMenu.classList.add('hidden');
    if (modalShareMenu) modalShareMenu.classList.add('hidden');
  }
  function openMoreMenu() {
    if (!modalMoreMenu) return;
    closeMoreMenu();
    modalMoreMenu.classList.remove('hidden');
    updateJoinLabel();
    updateWatchLabel();
  }

  function openCopyMenu() {
    if (!modalCopyMenu) return;
    const task = currentTask();
    if (!task) return;
    if (modalCopyTitle) modalCopyTitle.value = task.title || '';
    const columnsEl = getColumnsEl();
    const columnEls = columnsEl.querySelectorAll('.kanban-column');
    if (modalCopyColumn) {
      const opts = [];
      columnEls.forEach(colEl => {
        const colId = colEl.dataset.columnId;
        const titleEl = colEl.querySelector('h3');
        const title = titleEl ? titleEl.textContent.trim() : colId;
        const sel = String(colId) === String(task.column_id) ? ' selected' : '';
        opts.push(`<option value="${escapeHtml(String(colId))}"${sel}>${escapeHtml(title)}</option>`);
      });
      modalCopyColumn.innerHTML = opts.join('');
    }
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalCopyMenu.classList.remove('hidden');
  }

  function openShareMenu() {
    if (!modalShareMenu) return;
    const id = currentTaskId();
    if (!id) return;
    const url = `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(id)}`;
    if (modalShareUrl) modalShareUrl.value = url;
    if (modalShareFeedback) modalShareFeedback.classList.add('hidden');
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalShareMenu.classList.remove('hidden');
    setTimeout(() => modalShareUrl && modalShareUrl.select(), 50);
  }

  function openMoveMenu() {
    if (!modalMoveMenu) return;
    const task = currentTask();
    if (!task) return;
    const columnsEl = getColumnsEl();
    const columnEls = columnsEl.querySelectorAll('.kanban-column');
    const options = [];
    columnEls.forEach(colEl => {
      const colId = colEl.dataset.columnId;
      const titleEl = colEl.querySelector('h3');
      const title = titleEl ? titleEl.textContent.trim() : colId;
      const isCurrent = String(colId) === String(task.column_id);
      options.push(`<button type="button" class="pawtry-move-option ${isCurrent ? 'is-current' : ''}" data-column-id="${escapeHtml(String(colId))}">
        <span class="material-symbols-outlined" style="font-size:16px">${isCurrent ? 'check' : 'view_column'}</span>
        <span>${escapeHtml(title)}</span>
      </button>`);
    });
    if (modalMoveList) modalMoveList.innerHTML = options.join('');
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalMoveMenu.classList.remove('hidden');
  }

  // Join / Watch state helpers
  function isUserJoined(task) {
    const me = D.getCurrentUserId && D.getCurrentUserId();
    if (!me || !task || !Array.isArray(task.assignees)) return false;
    return task.assignees.some(u => String(u.id) === String(me));
  }
  function isUserWatching(task) {
    const me = D.getCurrentUserId && D.getCurrentUserId();
    if (!me || !task || !Array.isArray(task.watchers)) return false;
    return task.watchers.some(uid => String(uid) === String(me));
  }
  function updateJoinLabel() {
    const label = document.querySelector('[data-join-label]');
    if (!label) return;
    const task = currentTask();
    label.textContent = isUserJoined(task) ? 'Leave' : 'Join';
  }
  function updateWatchLabel() {
    const label = document.querySelector('[data-watch-label]');
    if (!label) return;
    const task = currentTask();
    label.textContent = isUserWatching(task) ? 'Unwatch' : 'Watch';
  }

  // Wiring
  if (modalMoreBtn) {
    modalMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const anyOpen = (
        (modalMoreMenu  && !modalMoreMenu.classList.contains('hidden')) ||
        (modalMoveMenu  && !modalMoveMenu.classList.contains('hidden')) ||
        (modalCopyMenu  && !modalCopyMenu.classList.contains('hidden')) ||
        (modalShareMenu && !modalShareMenu.classList.contains('hidden'))
      );
      if (anyOpen) closeMoreMenu(); else openMoreMenu();
    });
  }
  if (modalMoveBack)  modalMoveBack.addEventListener('click', () => { if (modalMoveMenu) modalMoveMenu.classList.add('hidden'); openMoreMenu(); });
  if (modalCopyBack)  modalCopyBack.addEventListener('click', () => { if (modalCopyMenu) modalCopyMenu.classList.add('hidden'); openMoreMenu(); });
  if (modalShareBack) modalShareBack.addEventListener('click', () => { if (modalShareMenu) modalShareMenu.classList.add('hidden'); openMoreMenu(); });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#modal-more-btn'))   return;
    if (e.target.closest('#modal-more-menu'))  return;
    if (e.target.closest('#modal-move-menu'))  return;
    if (e.target.closest('#modal-copy-menu'))  return;
    if (e.target.closest('#modal-share-menu')) return;
    closeMoreMenu();
  });

  // Menu actions
  if (modalMoreMenu) {
    modalMoreMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = currentTaskId();

      if (action === 'move') { openMoveMenu(); return; }
      if (action === 'copy') { openCopyMenu(); return; }
      if (action === 'share') {
        if (!id) { closeMoreMenu(); return; }
        openShareMenu();
        return;
      }

      if (action === 'join') {
        if (!id) { closeMoreMenu(); return; }
        const me = D.getCurrentUserId && D.getCurrentUserId();
        if (!me) { closeMoreMenu(); return; }
        closeMoreMenu();
        try {
          await api(`/tasks/${id}/assignees`, { method: 'POST', body: { user_id: me } });
          const task = taskCache.get(id);
          if (task) {
            task.assignees = Array.isArray(task.assignees) ? task.assignees : [];
            const already = task.assignees.find(u => String(u.id) === String(me));
            if (already) {
              task.assignees = task.assignees.filter(u => String(u.id) !== String(me));
            } else {
              const members = D.getBoardMembersCache && D.getBoardMembersCache();
              const self = members && members.find(u => String(u.id) === String(me));
              task.assignees.push(self || { id: me, full_name: 'Me' });
            }
            if (D.renderAssignees) D.renderAssignees(task);
          }
          if (showToast) showToast('Updated card members', 'check');
        } catch (err) {
          console.error('join failed:', err);
          if (showToast) showToast('Could not update membership', 'error');
        }
        return;
      }

      if (action === 'watch') {
        if (!id) { closeMoreMenu(); return; }
        closeMoreMenu();
        try {
          const data = await api(`/tasks/${id}/watch`, { method: 'POST' });
          const task = taskCache.get(id);
          if (task && data && Array.isArray(data.watchers)) task.watchers = data.watchers;
          if (showToast) showToast(
            (data && data.watching) ? 'Watching this card' : 'Stopped watching',
            'check'
          );
        } catch (err) {
          console.error('watch toggle failed:', err);
          if (showToast) showToast('Could not toggle watch', 'error');
        }
        return;
      }

      if (action === 'archive') {
        if (!id) { closeMoreMenu(); return; }
        if (!confirm('Archive this card? You can restore it later from the board archive.')) return;
        closeMoreMenu();
        try {
          await api(`/tasks/${id}/archive`, { method: 'POST' });
          const columnsEl = getColumnsEl();
          const card = columnsEl.querySelector(`.task-card[data-task-id="${id}"]`);
          if (card) {
            const columnEl = card.closest('.kanban-column');
            card.remove();
            if (columnEl && updateColumnBadge) updateColumnBadge(columnEl);
          }
          taskCache.delete(id);
          if (D.TaskModal.close) D.TaskModal.close();
          if (showToast) showToast('Card archived', 'archive');
        } catch (err) {
          console.error('archive failed:', err);
          if (showToast) showToast('Could not archive card', 'error');
        }
      }
    });
  }

  // Copy submit
  if (modalCopySubmit) {
    modalCopySubmit.addEventListener('click', async () => {
      const id = currentTaskId();
      if (!id) return;
      const title = (modalCopyTitle && modalCopyTitle.value.trim()) || 'Copy of card';
      const targetColumnId = modalCopyColumn && modalCopyColumn.value;
      if (!targetColumnId) return;
      modalCopySubmit.disabled = true;
      try {
        const data = await api(`/tasks/${id}/copy`, {
          method: 'POST',
          body: { title, column_id: targetColumnId },
        });
        const newTask = data && data.task;
        if (newTask) {
          taskCache.set(String(newTask.id), newTask);
          const columnsEl = getColumnsEl();
          const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${targetColumnId}"]`);
          if (colEl) {
            const dropZone = colEl.querySelector('.kanban-drop-zone');
            const placeholder = dropZone && dropZone.querySelector('.empty-placeholder, p.italic');
            if (placeholder) placeholder.remove();
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderTaskCard(newTask);
            const cardEl = wrapper.firstElementChild;
            if (dropZone && cardEl) {
              dropZone.appendChild(cardEl);
              if (attachSingleCardEvents) attachSingleCardEvents(cardEl);
              if (attachSingleCardDrag)   attachSingleCardDrag(cardEl);
              if (updateColumnBadge)      updateColumnBadge(colEl);
            }
          }
        }
        closeMoreMenu();
        if (showToast) showToast('Card copied', 'check');
      } catch (err) {
        console.error('copy failed:', err);
        if (showToast) showToast('Could not copy card', 'error');
      } finally {
        modalCopySubmit.disabled = false;
      }
    });
  }

  // Share — copy URL
  if (modalShareCopy) {
    modalShareCopy.addEventListener('click', async () => {
      if (!modalShareUrl) return;
      const url = modalShareUrl.value;
      try {
        await navigator.clipboard.writeText(url);
        if (modalShareFeedback) modalShareFeedback.classList.remove('hidden');
        setTimeout(() => modalShareFeedback && modalShareFeedback.classList.add('hidden'), 2000);
      } catch (err) {
        modalShareUrl.select();
        try { document.execCommand('copy'); if (modalShareFeedback) modalShareFeedback.classList.remove('hidden'); } catch (e) {}
      }
    });
  }

  // Move — pick target column
  if (modalMoveList) {
    modalMoveList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-column-id]');
      if (!btn) return;
      const id = currentTaskId();
      if (!id) return;
      const newColumnId = btn.dataset.columnId;
      const task = taskCache.get(id);
      if (!task || String(task.column_id) === String(newColumnId)) {
        closeMoreMenu();
        return;
      }
      closeMoreMenu();
      try {
        await api(`/tasks/${id}`, { method: 'PUT', body: { column_id: newColumnId } });
        task.column_id = newColumnId;
        const columnsEl = getColumnsEl();
        const card = columnsEl.querySelector(`.task-card[data-task-id="${id}"]`);
        const targetCol = columnsEl.querySelector(`.kanban-column[data-column-id="${newColumnId}"]`);
        const dropZone = targetCol ? targetCol.querySelector('.kanban-drop-zone') : null;
        if (card && dropZone) {
          const oldCol = card.closest('.kanban-column');
          dropZone.appendChild(card);
          if (updateColumnBadge) {
            if (oldCol) updateColumnBadge(oldCol);
            updateColumnBadge(targetCol);
          }
          const colTitle = targetCol.querySelector('h3');
          if (modalStatus && colTitle) modalStatus.textContent = colTitle.textContent.trim();
        }
        if (showToast) showToast('Task moved', 'check');
      } catch (err) {
        console.error('Failed to move task:', err);
        alert('Move failed: ' + (err.message || 'Unknown error'));
      }
    });
  }

  D.TaskModalActions = { closeMoreMenu, openMoreMenu };
})();
