
(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[TaskModal] window.Dashboard is missing — script order?');
    return;
  }

  const api               = D.api;
  const escapeHtml        = D.escapeHtml;
  const formatDueDate     = D.formatDueDate;
  const initials          = D.initials;
  const colorFor          = D.colorFor;
  const taskCache         = D.taskCache;
  const getLabels         = D.getBoardLabelsCache;
  const getMembers        = D.getBoardMembersCache;
  const getColumnsEl      = D.getColumnsEl;
  const getUserNameEl     = D.getUserNameEl;
  const renderTaskCard    = D.renderTaskCard;
  const attachSingleCardEvents = D.attachSingleCardEvents;
  const attachSingleCardDrag   = D.attachSingleCardDrag;
  const updateColumnBadge = D.updateColumnBadge;

  const modalEl               = document.getElementById('task-modal');
  const modalBackdrop         = document.getElementById('modal-backdrop');
  const modalPanel            = document.getElementById('modal-panel');
  const modalCloseBtn         = document.getElementById('modal-close');
  const modalTitle            = document.getElementById('modal-title');
  const modalDesc             = document.getElementById('modal-desc');
  const modalDue              = document.getElementById('modal-due');
  const modalDueText          = document.getElementById('modal-due-text');
  const modalStatus           = document.getElementById('modal-status');
  const modalAssignees        = document.getElementById('modal-assignees');
  const modalSaveBtn          = document.getElementById('modal-save');
  const modalDeleteBtn        = document.getElementById('modal-delete');

  const modalMembersSection   = document.getElementById('modal-members-section');
  const modalLabelsSection    = document.getElementById('modal-labels-section');
  const modalLabelsDisplay    = document.getElementById('modal-labels-display');
  const modalDueSection       = document.getElementById('modal-due-section');
  const modalCompleteCheckbox = document.getElementById('modal-complete-checkbox');
  const modalCompleteBadge    = document.getElementById('modal-complete-badge');
  const modalActivitySection  = document.getElementById('modal-activity-section');
  const modalCommentsList     = document.getElementById('modal-comments-list');
  const modalCommentInput     = document.getElementById('modal-comment-input');
  const modalCommentSubmit    = document.getElementById('modal-comment-submit');
  const modalCommentAvatar    = document.getElementById('modal-comment-avatar');
  const modalSidebar          = document.getElementById('modal-sidebar');
  const modalDueInput         = document.getElementById('modal-due-input');
  const modalDueSaveBtn       = document.getElementById('modal-due-save');
  const modalDueClearBtn      = document.getElementById('modal-due-clear');
  const modalCreateLabelBtn   = document.getElementById('modal-create-label-btn');

  const popupLabelsCreate        = document.getElementById('popup-labels-create');
  const popupLabelsCreateTitle   = document.getElementById('popup-labels-create-title');
  const popupLabelsCreateColors  = document.getElementById('popup-labels-create-colors');
  const popupLabelsCreateSubmit  = document.getElementById('popup-labels-create-submit');
  const popupLabelsCreateCancel  = document.getElementById('popup-labels-create-cancel');
  let   popupLabelsSelectedColor = null;

  const popupLabelsList  = document.getElementById('popup-labels-list');
  const popupMembersList = document.getElementById('popup-members-list');

  if (!modalEl || !modalPanel) {
    console.error('[TaskModal] Required modal elements missing.');
    return;
  }

  let activeTaskId   = null;
  let activeColumnId = null;
  let modalMode      = 'edit';

  const modalEditOnlySections = [
    modalMembersSection,
    modalLabelsSection,
    modalDueSection,
    modalActivitySection,
    modalSidebar,
  ];

  function closeAllPopups() {
    modalPanel.querySelectorAll('.mini-popup').forEach(p => p.classList.add('hidden'));
    // Collapse the inline "create label" form too so it doesn't linger.
    if (popupLabelsCreate && !popupLabelsCreate.classList.contains('hidden')) {
      popupLabelsCreate.classList.add('hidden');
      modalCreateLabelBtn.classList.remove('hidden');
    }
  }

  modalPanel.querySelectorAll('.sidebar-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popupId = btn.dataset.popup;
      const popup   = document.getElementById(popupId);
      if (!popup) return;
      const wasOpen = !popup.classList.contains('hidden');
      closeAllPopups();
      if (!wasOpen) popup.classList.remove('hidden');
    });
  });

  modalPanel.querySelectorAll('.mini-popup-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = btn.closest('.mini-popup');
      if (popup) popup.classList.add('hidden');
    });
  });

  modalPanel.addEventListener('click', (e) => {
    if (e.target.closest('.mini-popup') || e.target.closest('.sidebar-action-btn')) return;
    closeAllPopups();
  });

  function renderLabelsPopup(task) {
    const boardLabelsCache = getLabels();
    const selected = new Set((task.labels || []).map(l => String(l.id)));
    if (!boardLabelsCache.length) {
      popupLabelsList.innerHTML = '<li class="italic text-xs text-on-surface-variant/60 px-1 py-2">No labels yet — create one below.</li>';
      return;
    }
    popupLabelsList.innerHTML = boardLabelsCache.map(l => {
      const isOn = selected.has(String(l.id));
      const title = l.title ? escapeHtml(l.title) : '';
      return `
        <li>
          <button type="button" data-label-id="${escapeHtml(String(l.id))}"
                  class="group relative w-full h-8 rounded-md flex items-center justify-between px-2 text-[11px] font-bold text-white uppercase tracking-wide hover:opacity-90 transition-opacity"
                  style="background:${escapeHtml(l.color || '#6b7280')}">
            <span class="truncate">${title}</span>
            <span class="material-symbols-outlined text-sm ${isOn ? '' : 'invisible'}">check</span>
          </button>
        </li>
      `;
    }).join('');
  }

  function renderMembersPopup(task) {
    const boardMembersCache = getMembers();
    const selected = new Set((task.assignees || []).map(u => String(u.id)));
    if (!boardMembersCache.length) {
      popupMembersList.innerHTML = '<li class="italic text-xs text-on-surface-variant/60 px-1 py-2">No members in this board yet.</li>';
      return;
    }
    popupMembersList.innerHTML = boardMembersCache.map(u => {
      const isOn = selected.has(String(u.id));
      const label = escapeHtml(u.full_name || u.email || 'Unknown');
      return `
        <li>
          <button type="button" data-user-id="${escapeHtml(String(u.id))}"
                  class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-container-high transition-colors text-left">
            <span class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style="background:${colorFor(u.email || u.id || u.full_name)}">${escapeHtml(initials(u.full_name || u.email))}</span>
            <span class="flex-1 min-w-0 text-xs text-on-surface truncate">${label}</span>
            ${isOn ? '<span class="material-symbols-outlined text-sm text-primary">check</span>' : ''}
          </button>
        </li>
      `;
    }).join('');
  }

  function paintDueComplete(isComplete) {
    modalCompleteBadge.classList.toggle('hidden', !isComplete);
    modalDue.classList.toggle('bg-green-500/15', isComplete);
    modalDue.classList.toggle('bg-surface-container-high', !isComplete);
    modalDueText.classList.toggle('line-through', isComplete);
    modalDueText.classList.toggle('text-green-700', isComplete);
  }

  modalCompleteCheckbox.addEventListener('change', async () => {
    if (!activeTaskId) return;
    const next = modalCompleteCheckbox.checked;

    paintDueComplete(next);
    const cached = taskCache.get(activeTaskId);
    if (cached) cached.is_completed = next;

    try {
      await api(`/tasks/${activeTaskId}/complete`, {
        method: 'PUT',
        body: { is_completed: next },
      });
    } catch (err) {
      console.error('toggle complete failed:', err);
      alert('Could not update status: ' + (err.message || 'Unknown error'));
      modalCompleteCheckbox.checked = !next;
      paintDueComplete(!next);
      if (cached) cached.is_completed = !next;
    }
  });

  modalDueSaveBtn.addEventListener('click', async () => {
    if (!activeTaskId) return;
    const raw = modalDueInput.value;
    if (!raw) {
      alert('Please pick a date first.');
      return;
    }
    const dateOnly = raw.slice(0, 10);

    modalDueSaveBtn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/due_date`, {
        method: 'PUT',
        body: { due_date: dateOnly },
      });
      const updated = data.task;
      const cached  = taskCache.get(activeTaskId);
      if (cached) cached.due_date = updated.due_date;

      const formatted = formatDueDate(updated.due_date);
      modalDueText.textContent = formatted || 'No due date set';
      modalDueSection.classList.remove('hidden');
      closeAllPopups();
    } catch (err) {
      console.error('set due_date failed:', err);
      alert('Could not update due date: ' + (err.message || 'Unknown error'));
    } finally {
      modalDueSaveBtn.disabled = false;
    }
  });

  modalDueClearBtn.addEventListener('click', async () => {
    if (!activeTaskId) return;
    modalDueClearBtn.disabled = true;
    try {
      await api(`/tasks/${activeTaskId}/due_date`, {
        method: 'PUT',
        body: { due_date: null },
      });
      const cached = taskCache.get(activeTaskId);
      if (cached) cached.due_date = null;

      modalDueInput.value = '';
      modalDueSection.classList.add('hidden');
      closeAllPopups();
    } catch (err) {
      console.error('clear due_date failed:', err);
      alert('Could not clear due date: ' + (err.message || 'Unknown error'));
    } finally {
      modalDueClearBtn.disabled = false;
    }
  });

  modalCommentSubmit.addEventListener('click', async () => {
    if (!activeTaskId) return;
    const content = modalCommentInput.value.trim();
    if (!content) return;

    modalCommentSubmit.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/comments`, {
        method: 'POST',
        body: { content },
      });
      const comment = data.comment;

      const empty = modalCommentsList.querySelector('li.italic');
      if (empty) empty.remove();

      const author = (comment.author && (comment.author.full_name || comment.author.email)) || 'You';
      const when   = comment.created_at ? new Date(comment.created_at).toLocaleString() : '';
      const li = document.createElement('li');
      li.className = 'flex gap-3';
      li.innerHTML = `
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style="background:${colorFor(author)}">
          ${escapeHtml(initials(author))}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-semibold text-on-surface">${escapeHtml(author)}</span>
            <span class="text-[11px] text-on-surface-variant/70">${escapeHtml(when)}</span>
          </div>
          <div class="mt-1 bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface whitespace-pre-wrap break-words">${escapeHtml(comment.content || '')}</div>
        </div>
      `;
      modalCommentsList.appendChild(li);

      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.comments = Array.isArray(cached.comments) ? cached.comments : [];
        cached.comments.push(comment);
      }

      modalCommentInput.value = '';
    } catch (err) {
      console.error('add comment failed:', err);
      alert('Could not post comment: ' + (err.message || 'Unknown error'));
    } finally {
      modalCommentSubmit.disabled = false;
    }
  });

  popupLabelsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-label-id]');
    if (!btn || !activeTaskId) return;
    const labelId = btn.dataset.labelId;
    const label   = getLabels().find(l => String(l.id) === String(labelId));
    if (!label) return;

    btn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/labels`, {
        method: 'POST',
        body: { label_id: labelId },
      });
      const attached = !!data.attached;

      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.labels = Array.isArray(cached.labels) ? cached.labels : [];
        if (attached) {
          if (!cached.labels.some(l => String(l.id) === String(labelId))) {
            cached.labels.push(label);
          }
        } else {
          cached.labels = cached.labels.filter(l => String(l.id) !== String(labelId));
        }
        renderLabelsPopup(cached);
        refreshLabelsDisplay(cached);
      }
    } catch (err) {
      console.error('toggle label failed:', err);
      alert('Could not toggle label: ' + (err.message || 'Unknown error'));
    } finally {
      btn.disabled = false;
    }
  });

  popupMembersList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-user-id]');
    if (!btn || !activeTaskId) return;
    const userId = btn.dataset.userId;
    const user   = getMembers().find(u => String(u.id) === String(userId));
    if (!user) return;

    btn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/assign`, {
        method: 'POST',
        body: { user_id: userId },
      });
      const assigned = !!data.assigned;

      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.assignees = Array.isArray(cached.assignees) ? cached.assignees : [];
        if (assigned) {
          if (!cached.assignees.some(u => String(u.id) === String(userId))) {
            cached.assignees.push(user);
          }
        } else {
          cached.assignees = cached.assignees.filter(u => String(u.id) !== String(userId));
        }
        renderMembersPopup(cached);
        refreshAssigneesDisplay(cached);
      }
    } catch (err) {
      console.error('toggle assignee failed:', err);
      alert('Could not update members: ' + (err.message || 'Unknown error'));
    } finally {
      btn.disabled = false;
    }
  });

  function resetCreateLabelForm() {
    popupLabelsCreateTitle.value = '';
    popupLabelsSelectedColor     = null;
    popupLabelsCreateColors.querySelectorAll('.color-swatch').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-offset-2', 'ring-on-surface');
    });
  }

  function showCreateLabelForm() {
    resetCreateLabelForm();
    popupLabelsCreate.classList.remove('hidden');
    modalCreateLabelBtn.classList.add('hidden');
    popupLabelsCreateTitle.focus();
  }

  function hideCreateLabelForm() {
    popupLabelsCreate.classList.add('hidden');
    modalCreateLabelBtn.classList.remove('hidden');
  }

  modalCreateLabelBtn.addEventListener('click', showCreateLabelForm);
  popupLabelsCreateCancel.addEventListener('click', hideCreateLabelForm);

  popupLabelsCreateColors.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    popupLabelsSelectedColor = btn.dataset.color;
    popupLabelsCreateColors.querySelectorAll('.color-swatch').forEach(b => {
      b.classList.toggle('ring-2', b === btn);
      b.classList.toggle('ring-offset-2', b === btn);
      b.classList.toggle('ring-on-surface', b === btn);
    });
  });

  // POST /boards/:id/labels
  popupLabelsCreateSubmit.addEventListener('click', async () => {
    const activeBoardId = D.getActiveBoardId();
    if (!activeBoardId) return;
    if (!popupLabelsSelectedColor) {
      alert('Please pick a color first.');
      return;
    }
    const title = popupLabelsCreateTitle.value.trim();

    popupLabelsCreateSubmit.disabled = true;
    try {
      const data = await api(`/boards/${activeBoardId}/labels`, {
        method: 'POST',
        body: { title: title || null, color: popupLabelsSelectedColor },
      });

      getLabels().push(data.label);
      const cached = activeTaskId ? taskCache.get(activeTaskId) : null;
      renderLabelsPopup(cached || { labels: [] });
      hideCreateLabelForm();
    } catch (err) {
      console.error('create label failed:', err);
      alert('Could not create label: ' + (err.message || 'Unknown error'));
    } finally {
      popupLabelsCreateSubmit.disabled = false;
    }
  });

  function refreshLabelsDisplay(task) {
    const labels = Array.isArray(task.labels) ? task.labels : [];
    if (labels.length) {
      modalLabelsDisplay.innerHTML = labels.map(l => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-white uppercase tracking-wide" style="background:${escapeHtml(l.color || '#6b7280')}">
          ${escapeHtml(l.title || '')}
        </span>
      `).join('');
      modalLabelsSection.classList.remove('hidden');
    } else {
      modalLabelsDisplay.innerHTML = '';
      modalLabelsSection.classList.add('hidden');
    }
  }

  function refreshAssigneesDisplay(task) {
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    modalAssignees.innerHTML = assignees.length
      ? assignees.map(u => `
          <span class="inline-flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-full text-xs font-medium text-on-surface-variant" title="${escapeHtml(u.full_name || u.email || '')}">
            <span class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style="background:${colorFor(u.email || u.id || u.full_name)}">${escapeHtml(initials(u.full_name))}</span>
            ${escapeHtml(u.full_name || u.email)}
          </span>
        `).join('')
      : '<span class="text-xs text-on-surface-variant/50 italic">No members yet</span>';
  }

  function openTaskModal(taskId) {
    const task = taskCache.get(String(taskId));
    if (!task) return;

    modalMode      = 'edit';
    activeTaskId   = String(taskId);
    activeColumnId = task.column_id;

    modalEditOnlySections.forEach(s => s && s.classList.remove('hidden'));

    modalTitle.value = task.title || '';
    modalDesc.value  = task.description || '';

    const due = formatDueDate(task.due_date);
    if (due) {
      modalDueText.textContent = due;
      modalDueSection.classList.remove('hidden');
    } else {
      modalDueSection.classList.add('hidden');
    }

    if (task.due_date) {

      const iso = String(task.due_date);
      modalDueInput.value = iso.length === 10 ? `${iso}T09:00` : iso.slice(0, 16);
    } else {
      modalDueInput.value = '';
    }

    const isComplete = !!task.is_completed;
    modalCompleteCheckbox.checked = isComplete;
    paintDueComplete(isComplete);

    const columnsEl = getColumnsEl();
    const colEl    = columnsEl.querySelector(`.kanban-column[data-column-id="${task.column_id}"]`);
    const colTitle = colEl ? colEl.querySelector('h3') : null;
    modalStatus.textContent = colTitle ? colTitle.textContent.trim() : '—';

    refreshAssigneesDisplay(task);
    refreshLabelsDisplay(task);

    renderMembersPopup(task);
    renderLabelsPopup(task);

    const comments = Array.isArray(task.comments) ? task.comments : [];
    modalCommentsList.innerHTML = comments.length
      ? comments.map(c => {
          const author = (c.author && (c.author.full_name || c.author.email)) || 'Unknown';
          const when   = c.created_at ? new Date(c.created_at).toLocaleString() : '';
          return `
            <li class="flex gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style="background:${colorFor(author)}">
                ${escapeHtml(initials(author))}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-semibold text-on-surface">${escapeHtml(author)}</span>
                  <span class="text-[11px] text-on-surface-variant/70">${escapeHtml(when)}</span>
                </div>
                <div class="mt-1 bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface whitespace-pre-wrap break-words">${escapeHtml(c.content || '')}</div>
              </div>
            </li>
          `;
        }).join('')
      : '<li class="text-xs text-on-surface-variant/50 italic pl-11">No comments yet</li>';

    const userNameEl = getUserNameEl();
    modalCommentAvatar.textContent = (userNameEl && userNameEl.textContent.trim()[0]) || 'U';

    modalCommentInput.value = '';

    modalDeleteBtn.classList.remove('hidden');
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined text-base">save</span> Save Changes';

    modalSaveBtn.disabled   = false;
    modalDeleteBtn.disabled = false;
    closeAllPopups();

    modalEl.classList.remove('hidden');
  }

  function openCreateModal(columnId) {
    modalMode      = 'create';
    activeTaskId   = null;
    activeColumnId = columnId;

    modalTitle.value = '';
    modalDesc.value  = '';

    const columnsEl = getColumnsEl();
    const colEl    = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
    const colTitle = colEl ? colEl.querySelector('h3') : null;
    modalStatus.textContent = colTitle ? colTitle.textContent.trim() : '—';

    modalEditOnlySections.forEach(s => s && s.classList.add('hidden'));
    modalDeleteBtn.classList.add('hidden');
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined text-base">add_task</span> Create Task';

    modalSaveBtn.disabled = false;
    closeAllPopups();

    modalEl.classList.remove('hidden');
    modalTitle.focus();
  }

  function closeTaskModal() {
    modalEl.classList.add('hidden');
    closeAllPopups();
    activeTaskId = null;
  }

  modalCloseBtn.addEventListener('click', closeTaskModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target.closest('#modal-panel')) return;
    closeTaskModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTaskModal();
  });

  modalSaveBtn.addEventListener('click', async () => {
    const newTitle = modalTitle.value.trim();
    const newDesc  = modalDesc.value.trim();

    if (!newTitle) {
      alert('Title is required');
      modalTitle.focus();
      return;
    }

    modalSaveBtn.disabled = true;
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">progress_activity</span> Saving...';

    try {
      if (modalMode === 'create') {
        const data = await api('/tasks', {
          method: 'POST',
          body: { column_id: activeColumnId, title: newTitle, description: newDesc },
        });

        const task = data.task;

        taskCache.set(String(task.id), task);

        const columnsEl = getColumnsEl();
        const colEl   = columnsEl.querySelector(`.kanban-column[data-column-id="${activeColumnId}"]`);
        if (colEl) {
          const dropZone = colEl.querySelector('.kanban-drop-zone');

          const placeholder = dropZone.querySelector('.empty-placeholder, p.italic');
          if (placeholder) placeholder.remove();

          const wrapper = document.createElement('div');
          wrapper.innerHTML = renderTaskCard(task);
          const cardEl = wrapper.firstElementChild;
          dropZone.appendChild(cardEl);

          attachSingleCardEvents(cardEl);
          attachSingleCardDrag(cardEl);

          updateColumnBadge(colEl);
        }

      } else {
        if (!activeTaskId) return;

        await api(`/tasks/${activeTaskId}`, {
          method: 'PUT',
          body: { title: newTitle, description: newDesc },
        });

        const columnsEl = getColumnsEl();
        const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
        if (card) {
          const h4 = card.querySelector('h4');
          if (h4) h4.textContent = newTitle;

          const descP = card.querySelector('p.text-xs.text-on-surface-variant');
          if (newDesc) {
            if (descP) {
              descP.textContent = newDesc;
            } else {
              const newP = document.createElement('p');
              newP.className = 'text-xs text-on-surface-variant mb-3 line-clamp-2';
              newP.textContent = newDesc;
              h4.insertAdjacentElement('afterend', newP);
            }
          } else if (descP) {
            descP.remove();
          }
        }

        const cached = taskCache.get(activeTaskId);
        if (cached) {
          cached.title = newTitle;
          cached.description = newDesc;
        }
      }

      closeTaskModal();
    } catch (err) {
      console.error('Failed to save task:', err);
      alert((modalMode === 'create' ? 'Create' : 'Update') + ' failed: ' + (err.message || 'Unknown error'));
    } finally {
      modalSaveBtn.disabled = false;
      modalSaveBtn.innerHTML = modalMode === 'create'
        ? '<span class="material-symbols-outlined text-base">add_task</span> Create Task'
        : '<span class="material-symbols-outlined text-base">save</span> Save Changes';
    }
  });

  modalDeleteBtn.addEventListener('click', async () => {
    if (!activeTaskId) return;
    if (!confirm('Are you sure you want to delete this task?')) return;

    modalDeleteBtn.disabled = true;
    modalDeleteBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">progress_activity</span>';

    try {
      await api(`/tasks/${activeTaskId}`, { method: 'DELETE' });

      const columnsEl = getColumnsEl();
      const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
      if (card) {
        const columnEl = card.closest('.kanban-column');
        card.remove();
        if (columnEl) updateColumnBadge(columnEl);
      }

      taskCache.delete(activeTaskId);

      closeTaskModal();
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Delete failed: ' + (err.message || 'Unknown error'));
    } finally {
      modalDeleteBtn.disabled = false;
      modalDeleteBtn.innerHTML = '<span class="material-symbols-outlined text-base">delete</span> Delete';
    }
  });

  window.Dashboard.openTaskModal   = openTaskModal;
  window.Dashboard.openCreateModal = openCreateModal;
  window.Dashboard.closeTaskModal  = closeTaskModal;
})();
