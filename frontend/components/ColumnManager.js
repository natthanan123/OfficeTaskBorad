(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[ColumnManager] window.Dashboard is missing — script order?');
    return;
  }

  const api            = D.api;
  const escapeHtml     = D.escapeHtml;
  const showToast      = D.showToast;
  const state          = D.state;
  const loadBoardData  = D.loadBoardData;
  const renderTaskCard = D.renderTaskCard;
  const columnsEl      = D.getColumnsEl();
  const addColumnBtn   = D.getAddColumnBtn();

  //Color presets
  const COLUMN_COLOR_PRESETS = ['#3525cd', '#58579b', '#7e3000', '#a44100', '#4f46e5', '#454386', '#16a34a', '#dc2626', '#0891b2', '#ca8a04'];

  //Contrast helper — pick black/white text based on hex bg
  function contrastTextColor(hex) {
    if (!hex) return '';
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return '';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? '#0f172a' : '#ffffff';
  }

  function renderColumn(column) {
    const tasks = Array.isArray(column.tasks) ? [...column.tasks] : [];
    tasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const cardsHtml = tasks.length
      ? tasks.map(renderTaskCard).join('')
      : `<p class="empty-placeholder text-xs text-on-surface-variant/50 italic text-center py-4">No tasks yet</p>`;

    //Solid accent color + readable text
    const color = (column.color && /^#[0-9a-fA-F]{3,8}$/.test(column.color)) ? column.color : '';
    const textColor = color ? contrastTextColor(color) : '';
    const colorStyle = color ? `background-color:${color};color:${textColor};` : '';
    const titleStyle = color ? `color:${textColor};` : '';
    const badgeStyle = color
      ? `background-color:rgba(255,255,255,${textColor === '#ffffff' ? '0.18' : '0.55'});color:${textColor};`
      : '';

    const isCollapsed = !!column._collapsed;
    const collapsedClass = isCollapsed ? ' kanban-column-collapsed' : '';

    return `
      <div class="kanban-column flex flex-col self-start max-h-full bg-surface-container-low rounded-xl p-3${collapsedClass}" data-column-id="${escapeHtml(column.id)}" data-column-color="${escapeHtml(color)}" data-column-title="${escapeHtml(column.title)}" style="${colorStyle}">
        <div class="column-drag-handle flex justify-between items-center px-2 py-3 mb-2">
          <div class="flex items-center space-x-2 column-header-info">
            <button type="button" class="column-collapse-toggle text-on-surface-variant/60 hover:text-on-surface" data-column-id="${escapeHtml(column.id)}" title="${isCollapsed ? 'Expand column' : 'Collapse column'}" style="${color ? `color:${textColor};` : ''}">
              <span class="material-symbols-outlined text-base">${isCollapsed ? 'chevron_right' : 'unfold_less'}</span>
            </button>
            <h3 class="column-title font-bold text-on-surface-variant tracking-tight cursor-pointer" data-column-id="${escapeHtml(column.id)}" style="${titleStyle}" title="Click to collapse/expand">${escapeHtml(column.title)}</h3>
            <span class="column-count-badge bg-surface-container-highest px-2 py-0.5 rounded-full text-[10px] font-bold text-on-surface-variant" style="${badgeStyle}">${tasks.length}</span>
          </div>
          <div class="relative">
            <button type="button"
                    class="column-options-btn text-on-surface-variant/50 hover:text-primary"
                    data-column-id="${escapeHtml(column.id)}"
                    aria-haspopup="menu"
                    aria-expanded="false">
              <span class="material-symbols-outlined">more_horiz</span>
            </button>
            <div class="column-options-menu hidden absolute right-0 top-full mt-1 z-40 min-w-[200px] bg-surface-container-highest border border-outline/20 rounded-xl shadow-2xl py-1 text-sm">
              <button type="button"
                      class="column-edit-btn w-full text-left px-4 py-2 text-on-surface hover:bg-surface-container-low flex items-center gap-2 transition-colors"
                      data-column-id="${escapeHtml(column.id)}">
                <span class="material-symbols-outlined text-base">edit</span>
                <span>Edit Column Name</span>
              </button>
              <button type="button"
                      class="column-copy-btn w-full text-left px-4 py-2 text-on-surface hover:bg-surface-container-low flex items-center gap-2 transition-colors border-t border-outline/10"
                      data-column-id="${escapeHtml(column.id)}">
                <span class="material-symbols-outlined text-base">content_copy</span>
                <span>Copy Column to Board…</span>
              </button>
              <button type="button"
                      class="column-color-toggle w-full text-left px-4 py-2 text-on-surface hover:bg-surface-container-low flex items-center gap-2 transition-colors border-t border-outline/10"
                      data-column-id="${escapeHtml(column.id)}"
                      aria-expanded="false">
                <span class="material-symbols-outlined text-base" style="${color ? `color:${color}` : ''}">palette</span>
                <span>Edit Color</span>
                ${color ? `<span class="ml-auto w-3 h-3 rounded-full" style="background:${color}"></span>` : ''}
              </button>
              <div class="column-color-section hidden px-4 py-2 border-t border-outline/10 bg-surface-container-low/50">
                <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Pick a color</p>
                <div class="flex flex-wrap gap-1.5 mb-2">
                  ${COLUMN_COLOR_PRESETS.map(c => `
                    <button type="button"
                            class="column-color-swatch w-5 h-5 rounded-full border-2 ${color.toLowerCase() === c.toLowerCase() ? 'border-on-surface' : 'border-transparent'} hover:scale-110 transition-transform"
                            data-column-id="${escapeHtml(column.id)}"
                            data-color="${c}"
                            style="background:${c}"
                            title="${c}"></button>
                  `).join('')}
                </div>
                <div class="flex items-center gap-2">
                  <input type="color"
                         class="column-color-input w-8 h-8 rounded-md border-0 p-0 cursor-pointer"
                         data-column-id="${escapeHtml(column.id)}"
                         value="${color || '#3525cd'}"/>
                  <button type="button"
                          class="column-color-clear text-[11px] text-on-surface-variant hover:text-error underline"
                          data-column-id="${escapeHtml(column.id)}">Clear</button>
                </div>
              </div>
              <button type="button"
                      class="column-delete-btn w-full text-left px-4 py-2 text-error hover:bg-error/10 flex items-center gap-2 transition-colors border-t border-outline/10"
                      data-column-id="${escapeHtml(column.id)}">
                <span class="material-symbols-outlined text-base">delete</span>
                <span>Delete Column</span>
              </button>
            </div>
          </div>
        </div>
        <div class="kanban-drop-zone space-y-4 overflow-y-auto pr-1 transition-all duration-150">
          ${cardsHtml}
        </div>
        <button class="add-task-btn mt-3 w-full py-2 text-sm text-on-surface-variant/50 hover:text-primary hover:bg-primary/5 rounded-lg transition-all flex items-center justify-center space-x-1 group"
                data-column-id="${escapeHtml(column.id)}">
          <span class="material-symbols-outlined text-base group-hover:text-primary">add</span>
          <span>Add Task</span>
        </button>
      </div>
    `;
  }

  //Save color
  async function updateColumnColor(columnId, color) {
    if (!columnId) return;
    try {
      await api(`/columns/${columnId}`, {
        method: 'PUT',
        body: { color: color || null },
      });
      await loadBoardData(state.activeBoardId);
      showToast(color ? 'Column color updated' : 'Column color cleared', 'palette');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to update column color:', err);
      showToast(err.message || 'Could not update column color', 'error');
    }
  }

  function closeAllColumnMenus() {
    columnsEl.querySelectorAll('.column-options-menu').forEach(m => m.classList.add('hidden'));
    columnsEl.querySelectorAll('.column-options-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  if (!state.collapsedColumns) state.collapsedColumns = new Set();

  //Collapse Column toggle
  function toggleCollapseColumn(columnId) {
    if (!columnId) return;
    const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
    if (!colEl) return;
    const willCollapse = !colEl.classList.contains('kanban-column-collapsed');
    colEl.classList.toggle('kanban-column-collapsed', willCollapse);
    if (willCollapse) state.collapsedColumns.add(String(columnId));
    else state.collapsedColumns.delete(String(columnId));
    const toggleBtn = colEl.querySelector('.column-collapse-toggle .material-symbols-outlined');
    if (toggleBtn) toggleBtn.textContent = willCollapse ? 'chevron_right' : 'unfold_less';
    const toggleWrap = colEl.querySelector('.column-collapse-toggle');
    if (toggleWrap) toggleWrap.title = willCollapse ? 'Expand column' : 'Collapse column';
  }

  function applyCollapsedStateAfterRender() {
    if (!state.collapsedColumns || !state.collapsedColumns.size) return;
    state.collapsedColumns.forEach(id => {
      const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${id}"]`);
      if (colEl) {
        colEl.classList.add('kanban-column-collapsed');
        const icon = colEl.querySelector('.column-collapse-toggle .material-symbols-outlined');
        if (icon) icon.textContent = 'chevron_right';
      }
    });
  }

  function attachColumnOptionEvents() {
    columnsEl.querySelectorAll('.column-options-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.parentElement.querySelector('.column-options-menu');
        if (!menu) return;
        const willOpen = menu.classList.contains('hidden');
        closeAllColumnMenus();
        if (willOpen) {
          menu.classList.remove('hidden');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    columnsEl.querySelectorAll('.column-collapse-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapseColumn(btn.dataset.columnId);
      });
    });

    columnsEl.querySelectorAll('.column-title').forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapseColumn(t.dataset.columnId);
      });
    });

    applyCollapsedStateAfterRender();

    columnsEl.querySelectorAll('.column-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        const columnId = btn.dataset.columnId;
        if (!columnId) return;

        const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        const currentTitle = colEl?.querySelector('.column-title')?.textContent?.trim() || '';

        const raw = prompt('Edit column name:', currentTitle);
        if (raw === null) return;
        const title = raw.trim();
        if (!title || title === currentTitle) return;

        try {
          await api(`/columns/${columnId}`, {
            method: 'PUT',
            body: { title },
          });
          await loadBoardData(state.activeBoardId);
          showToast('Column renamed', 'edit');
        } catch (err) {
          if (err.message === 'Unauthorized') return;
          console.error('Failed to rename column:', err);
          showToast(err.message || 'Could not rename column', 'error');
        }
      });
    });

    //Edit Color toggle
    columnsEl.querySelectorAll('.column-color-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = btn.parentElement.querySelector('.column-color-section');
        if (!section) return;
        const willOpen = section.classList.contains('hidden');
        section.classList.toggle('hidden', !willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
      });
    });

    //Swatches
    columnsEl.querySelectorAll('.column-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        await updateColumnColor(swatch.dataset.columnId, swatch.dataset.color);
      });
    });

    //Hex picker
    columnsEl.querySelectorAll('.column-color-input').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        await updateColumnColor(input.dataset.columnId, input.value);
      });
    });

    //Clear color
    columnsEl.querySelectorAll('.column-color-clear').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        await updateColumnColor(btn.dataset.columnId, null);
      });
    });

    //Copy Column
    columnsEl.querySelectorAll('.column-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        const columnId = btn.dataset.columnId;
        if (!columnId) return;
        const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        const sourceTitle = colEl?.querySelector('.column-title')?.textContent?.trim() || '';
        if (D.openCopyColumnDialog) {
          D.openCopyColumnDialog({ columnId, sourceTitle });
        }
      });
    });

    columnsEl.querySelectorAll('.column-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllColumnMenus();
        const columnId = btn.dataset.columnId;
        if (!columnId) return;

        const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        const title = colEl?.querySelector('.column-title')?.textContent?.trim() || 'this column';
        if (!confirm(`Delete column "${title}"?\n\nAll tasks inside it will be permanently removed.`)) return;

        try {
          await api(`/columns/${columnId}`, { method: 'DELETE' });
          showToast('Column deleted', 'delete');
          await loadBoardData(state.activeBoardId);
        } catch (err) {
          if (err.message === 'Unauthorized') return;
          console.error('Failed to delete column:', err);
          showToast(err.message || 'Could not delete column', 'error');
        }
      });
    });
  }

  function updateColumnBadge(columnEl) {
    const dropZone = columnEl.querySelector('.kanban-drop-zone');
    const badge = columnEl.querySelector('.bg-surface-container-highest');
    if (!dropZone || !badge) return;
    const count = dropZone.querySelectorAll('.task-card:not(.hidden)').length;
    badge.textContent = count;
    const placeholder = dropZone.querySelector('.empty-placeholder');
    if (count === 0 && !placeholder) {
      const p = document.createElement('p');
      p.className = 'empty-placeholder text-xs text-on-surface-variant/50 italic text-center py-4';
      p.textContent = 'No tasks yet';
      dropZone.appendChild(p);
    } else if (count > 0 && placeholder) {
      placeholder.remove();
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.column-color-section')) return;
    if (e.target.closest('.column-options-menu') || e.target.closest('.column-options-btn')) return;
    closeAllColumnMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllColumnMenus();
  });

  //Create column
  async function createColumnPrompt() {
    if (!state.activeBoardId) {
      alert('Please select or create a board first');
      return;
    }
    const raw = prompt('Enter new column name:');
    if (raw === null) return;
    const title = raw.trim();
    if (!title) return;

    try {
      await api('/columns', {
        method: 'POST',
        body: { title, board_id: state.activeBoardId },
      });
      await loadBoardData(state.activeBoardId);
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to create column:', err);
      alert('Could not create column: ' + (err.message || 'Unknown error'));
    }
  }

  //Dblclick empty area
  columnsEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('.kanban-column')) return;
    if (e.target.closest('#kanban-add-column-placeholder, #kanban-empty-add-column')) {
      createColumnPrompt();
      return;
    }
    if (e.target.closest('button, input, textarea, a')) return;
    createColumnPrompt();
  });

  //Click placeholder
  columnsEl.addEventListener('click', (e) => {
    const placeholder = e.target.closest('#kanban-add-column-placeholder, #kanban-empty-add-column');
    if (placeholder) {
      e.preventDefault();
      createColumnPrompt();
    }
  });

  addColumnBtn.addEventListener('click', async () => {
    addColumnBtn.disabled = true;
    try {
      await createColumnPrompt();
    } finally {
      addColumnBtn.disabled = false;
    }
  });

  //Copy Column dialog
  function ensureCopyColumnDialog() {
    let dlg = document.getElementById('copy-column-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('div');
    dlg.id = 'copy-column-dialog';
    dlg.className = 'fixed inset-0 z-[180] hidden';
    dlg.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" data-cc-close></div>
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
            <h3 class="font-semibold text-gray-800">Copy Column to Board</h3>
            <button type="button" data-cc-close class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100" title="Close">
              <span class="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          <div class="p-5 space-y-4">
            <label class="block">
              <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">New column title</span>
              <input id="cc-title" type="text" maxlength="120" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm"/>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Target board</span>
              <select id="cc-board" class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm bg-white"></select>
            </label>
            <p class="text-[11px] text-gray-500 italic">Labels and assignees that don't exist on the target board will be removed from copied tasks.</p>
            <button id="cc-submit" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">Copy Column</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.querySelectorAll('[data-cc-close]').forEach(el => el.addEventListener('click', () => dlg.classList.add('hidden')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dlg.classList.contains('hidden')) dlg.classList.add('hidden');
    });
    return dlg;
  }

  function openCopyColumnDialog({ columnId, sourceTitle }) {
    const dlg = ensureCopyColumnDialog();
    const titleInput = dlg.querySelector('#cc-title');
    const boardSel   = dlg.querySelector('#cc-board');
    const submitBtn  = dlg.querySelector('#cc-submit');
    titleInput.value = `${sourceTitle || 'Column'} (copy)`;
    const boards = state.cachedBoards || [];
    boardSel.innerHTML = boards.map(b => {
      const sel = String(b.id) === String(state.activeBoardId) ? ' selected' : '';
      return `<option value="${escapeHtml(b.id)}"${sel}>${escapeHtml(b.title || 'Untitled')}</option>`;
    }).join('');
    dlg.classList.remove('hidden');
    setTimeout(() => titleInput.focus(), 50);

    submitBtn.onclick = async () => {
      const targetBoardId = boardSel.value;
      const newTitle = titleInput.value.trim();
      if (!targetBoardId) return;
      submitBtn.disabled = true;
      try {
        await api(`/columns/${columnId}/copy`, {
          method: 'POST',
          body: { target_board_id: targetBoardId, title: newTitle },
        });
        showToast('Column copied', 'content_copy');
        dlg.classList.add('hidden');
        if (String(targetBoardId) === String(state.activeBoardId)) {
          await loadBoardData(state.activeBoardId);
        }
      } catch (err) {
        if (err.message === 'Unauthorized') return;
        console.error('copy column failed:', err);
        showToast(err.message || 'Could not copy column', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    };
  }

  D.openCopyColumnDialog      = openCopyColumnDialog;
  D.renderColumn              = renderColumn;
  D.attachColumnOptionEvents  = attachColumnOptionEvents;
  D.updateColumnBadge         = updateColumnBadge;
  D.closeAllColumnMenus       = closeAllColumnMenus;
})();
