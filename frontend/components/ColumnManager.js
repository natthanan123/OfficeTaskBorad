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

  function renderColumn(column) {
    const tasks = Array.isArray(column.tasks) ? [...column.tasks] : [];
    tasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const cardsHtml = tasks.length
      ? tasks.map(renderTaskCard).join('')
      : `<p class="text-xs text-on-surface-variant/50 italic text-center py-4">No tasks yet</p>`;

    //Accent color
    const color = (column.color && /^#[0-9a-fA-F]{3,8}$/.test(column.color)) ? column.color : '';
    const colorStyle = color ? `border-left:4px solid ${color};` : '';

    return `
      <div class="kanban-column flex flex-col self-start max-h-full bg-surface-container-low rounded-xl p-3" data-column-id="${escapeHtml(column.id)}" data-column-color="${escapeHtml(color)}" style="${colorStyle}">
        <div class="flex justify-between items-center px-2 py-3 mb-2">
          <div class="flex items-center space-x-2">
            <h3 class="column-title font-bold text-on-surface-variant tracking-tight" ${color ? `style="color:${color}"` : ''}>${escapeHtml(column.title)}</h3>
            <span class="bg-surface-container-highest px-2 py-0.5 rounded-full text-[10px] font-bold text-on-surface-variant">${tasks.length}</span>
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

  D.renderColumn              = renderColumn;
  D.attachColumnOptionEvents  = attachColumnOptionEvents;
  D.updateColumnBadge         = updateColumnBadge;
  D.closeAllColumnMenus       = closeAllColumnMenus;
})();
