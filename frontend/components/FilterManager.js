(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[FilterManager] window.Dashboard is missing — script order?');
    return;
  }

  const escapeHtml = D.escapeHtml;
  const initials   = D.initials;
  const colorFor   = D.colorFor;
  const state      = D.state;
  const taskCache  = D.taskCache;
  const columnsEl  = D.getColumnsEl();

  const filterBtn         = document.getElementById('filter-btn');
  const filterPopup       = document.getElementById('filter-popup');
  const filterBadge       = document.getElementById('filter-active-badge');
  const filterClearBtn    = document.getElementById('filter-clear-btn');
  const filterLabelsList  = document.getElementById('filter-labels-list');
  const filterMembersList = document.getElementById('filter-members-list');
  const searchInput       = document.getElementById('global-search-input');

  if (!filterBtn || !filterPopup || !searchInput) {
    console.error('[FilterManager] Required DOM elements are missing.');
    return;
  }

  const selectedLabelIds  = new Set();
  const selectedMemberIds = new Set();

  function renderFilterOptions() {
    const labels  = (state && state.boardLabelsCache)  || [];
    const members = (state && state.boardMembersCache) || [];

    for (const id of Array.from(selectedLabelIds)) {
      if (!labels.find(l => String(l.id) === String(id))) selectedLabelIds.delete(id);
    }
    for (const id of Array.from(selectedMemberIds)) {
      if (!members.find(m => String(m.id) === String(id))) selectedMemberIds.delete(id);
    }

    if (!labels.length) {
      filterLabelsList.innerHTML = `<li class="text-[11px] text-on-surface-variant/60 italic">No labels on this board</li>`;
    } else {
      filterLabelsList.innerHTML = labels.map(l => {
        const checked = selectedLabelIds.has(String(l.id)) ? 'checked' : '';
        const color = escapeHtml(l.color || '#6b7280');
        const title = escapeHtml(l.title || '');
        return `
          <li>
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-container-low cursor-pointer">
              <input type="checkbox" class="filter-label-cb w-4 h-4 rounded accent-primary cursor-pointer" data-label-id="${escapeHtml(l.id)}" ${checked}/>
              <span class="h-4 w-10 rounded-sm flex-shrink-0" style="background:${color}"></span>
              <span class="text-xs text-on-surface truncate flex-1">${title || '\u00A0'}</span>
            </label>
          </li>
        `;
      }).join('');
    }

    if (!members.length) {
      filterMembersList.innerHTML = `<li class="text-[11px] text-on-surface-variant/60 italic">No members on this board</li>`;
    } else {
      filterMembersList.innerHTML = members.map(m => {
        const checked = selectedMemberIds.has(String(m.id)) ? 'checked' : '';
        const name  = m.full_name || m.email || 'Unknown';
        const seed  = m.email || m.id || name;
        const bg    = colorFor(seed);
        return `
          <li>
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-container-low cursor-pointer">
              <input type="checkbox" class="filter-member-cb w-4 h-4 rounded accent-primary cursor-pointer" data-member-id="${escapeHtml(m.id)}" ${checked}/>
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style="background-color:${bg}">${escapeHtml(initials(name))}</span>
              <span class="text-xs text-on-surface truncate flex-1">${escapeHtml(name)}</span>
            </label>
          </li>
        `;
      }).join('');
    }

    filterLabelsList.querySelectorAll('.filter-label-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.labelId;
        if (cb.checked) selectedLabelIds.add(id);
        else selectedLabelIds.delete(id);
        applyFilters();
      });
    });

    filterMembersList.querySelectorAll('.filter-member-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.memberId;
        if (cb.checked) selectedMemberIds.add(id);
        else selectedMemberIds.delete(id);
        applyFilters();
      });
    });
  }

  function updateBadge() {
    const total = selectedLabelIds.size + selectedMemberIds.size;
    if (total > 0) {
      filterBadge.textContent = String(total);
      filterBadge.classList.remove('hidden');
    } else {
      filterBadge.classList.add('hidden');
    }
  }

  function taskMatchesSearch(task, query) {
    if (!query) return true;
    const title = (task.title || '').toLowerCase();
    const desc  = (task.description || '').toLowerCase();
    return title.includes(query) || desc.includes(query);
  }

  function taskMatchesLabels(task) {
    if (selectedLabelIds.size === 0) return true;
    const labels = Array.isArray(task.labels) ? task.labels : [];
    return labels.some(l => selectedLabelIds.has(String(l.id)));
  }

  function taskMatchesMembers(task) {
    if (selectedMemberIds.size === 0) return true;
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    return assignees.some(a => selectedMemberIds.has(String(a.id)));
  }

  function applyFilters() {
    const query = (searchInput.value || '').trim().toLowerCase();

    columnsEl.querySelectorAll('.task-card').forEach(card => {
      const taskId = card.dataset.taskId;
      const task   = taskCache.get(String(taskId));
      if (!task) {
        card.classList.add('hidden');
        return;
      }
      const matches = taskMatchesSearch(task, query)
        && taskMatchesLabels(task)
        && taskMatchesMembers(task);
      card.classList.toggle('hidden', !matches);
    });

    if (D.updateColumnBadge) {
      columnsEl.querySelectorAll('.kanban-column').forEach(colEl => {
        D.updateColumnBadge(colEl);
      });
    }

    updateBadge();
  }

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = filterPopup.classList.contains('hidden');
    if (willOpen) renderFilterOptions();
    filterPopup.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (filterPopup.classList.contains('hidden')) return;
    if (filterPopup.contains(e.target) || filterBtn.contains(e.target)) return;
    filterPopup.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !filterPopup.classList.contains('hidden')) {
      filterPopup.classList.add('hidden');
    }
  });

  filterClearBtn.addEventListener('click', () => {
    selectedLabelIds.clear();
    selectedMemberIds.clear();
    searchInput.value = '';
    renderFilterOptions();
    applyFilters();
  });

  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 120);
  });

  window.addEventListener('dashboard:board-loaded', () => {
    renderFilterOptions();
    applyFilters();
  });

  D.applyFilters         = applyFilters;
  D.renderFilterOptions  = renderFilterOptions;
  D.getActiveFilters     = () => ({
    search: (searchInput.value || '').trim(),
    labelIds:  Array.from(selectedLabelIds),
    memberIds: Array.from(selectedMemberIds),
  });
})();
