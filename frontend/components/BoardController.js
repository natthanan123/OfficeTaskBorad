(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[BoardController] window.Dashboard is missing — script order?');
    return;
  }

  const api           = D.api;
  const escapeHtml    = D.escapeHtml;
  const showToast     = D.showToast;
  const state         = D.state;
  const loadBoardData = D.loadBoardData;

  const boardTitleEl = D.getBoardTitleEl();
  const columnsEl    = D.getColumnsEl();
  const boardListEl  = D.getBoardListEl();
  const newBoardBtn  = D.getNewBoardBtn();

  function renderBoardList() {
    if (!state.cachedBoards.length) {
      boardListEl.innerHTML = `
        <li class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">
          No boards yet. Click "New Board" to create one.
        </li>
      `;
      return;
    }

    const isAdmin = state.currentUserRole === 'admin';

    boardListEl.innerHTML = state.cachedBoards.map(b => {
      const isActive = String(b.id) === String(state.activeBoardId);
      const isCreator = state.currentUserId != null && String(b.creator_id) === String(state.currentUserId);
      const stateClasses = isActive
        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-semibold border-r-2 border-indigo-600'
        : 'text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20';
      //Owner hint
      const ownerHint = (isAdmin && !isCreator && b.creator)
        ? ` — owner: ${b.creator.full_name || b.creator.email}`
        : '';
      return `
        <li class="group relative">
          <div role="button" tabindex="0"
               class="board-list-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors text-left cursor-pointer ${stateClasses}"
               data-board-id="${escapeHtml(b.id)}"
               title="${escapeHtml((b.title || 'Untitled') + ownerHint)}">
            <span class="material-symbols-outlined text-base shrink-0">view_kanban</span>
            <span class="truncate flex-1">${escapeHtml(b.title || 'Untitled')}</span>
            <button type="button"
                    class="board-more-btn opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                    data-board-id="${escapeHtml(b.id)}"
                    title="More actions">
              <span class="material-symbols-outlined text-base">more_vert</span>
            </button>
          </div>
        </li>
      `;
    }).join('');

    boardListEl.querySelectorAll('.board-list-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.board-more-btn')) return;
        const id = btn.dataset.boardId;
        if (!id || id === state.activeBoardId) return;
        state.activeBoardId = id;
        renderBoardList();
        loadBoardData(state.activeBoardId);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openBoardContextMenu(e.clientX, e.clientY, btn.dataset.boardId);
      });
    });

    boardListEl.querySelectorAll('.board-more-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = btn.getBoundingClientRect();
        openBoardContextMenu(rect.right, rect.bottom, btn.dataset.boardId);
      });
    });
  }

  async function loadBoards() {
    try {
      const data = await api('/boards');
      state.cachedBoards = (data && data.boards) || [];
      renderBoardList();
      return state.cachedBoards;
    } catch (err) {
      if (err.message === 'Unauthorized') return [];
      console.error('Failed to load boards:', err);
      boardListEl.innerHTML = `
        <li class="px-3 py-2 text-xs text-error italic">Could not load boards</li>
      `;
      return [];
    }
  }

  const boardCtxMenuEl      = document.getElementById('board-context-menu');
  const ctxDeleteBoardEl    = document.getElementById('ctx-delete-board');
  const ctxLeaveBoardEl     = document.getElementById('ctx-leave-board');
  const ctxDuplicateBoardEl = document.getElementById('ctx-duplicate-board');
  let   ctxMenuBoardId      = null;

  function closeBoardContextMenu() {
    if (!boardCtxMenuEl) return;
    boardCtxMenuEl.classList.add('hidden');
    ctxMenuBoardId = null;
  }

  function openBoardContextMenu(x, y, boardId) {
    if (!boardCtxMenuEl || !boardId) return;
    const board = state.cachedBoards.find(b => String(b.id) === String(boardId));
    if (!board) return;

    ctxMenuBoardId = boardId;

    //Permissions
    const isCreator = state.currentUserId != null && String(board.creator_id) === String(state.currentUserId);
    const isAdmin   = state.currentUserRole === 'admin';
    const canDelete = isCreator || isAdmin;
    ctxDeleteBoardEl.classList.toggle('hidden', !canDelete);
    ctxLeaveBoardEl.classList.toggle('hidden',   isCreator);

    boardCtxMenuEl.style.left = '0px';
    boardCtxMenuEl.style.top  = '0px';
    boardCtxMenuEl.classList.remove('hidden');

    const rect  = boardCtxMenuEl.getBoundingClientRect();
    const maxX  = window.innerWidth  - rect.width  - 8;
    const maxY  = window.innerHeight - rect.height - 8;
    boardCtxMenuEl.style.left = `${Math.min(x, maxX)}px`;
    boardCtxMenuEl.style.top  = `${Math.min(y, maxY)}px`;
  }

  if (ctxDeleteBoardEl) {
    ctxDeleteBoardEl.addEventListener('click', async () => {
      const boardId = ctxMenuBoardId;
      closeBoardContextMenu();
      if (!boardId) return;

      const board = state.cachedBoards.find(b => String(b.id) === String(boardId));
      const title = (board && board.title) || 'this board';
      if (!confirm(`Delete "${title}"?\n\nAll of its columns and tasks will be permanently removed. This cannot be undone.`)) return;

      try {
        await api(`/boards/${boardId}`, { method: 'DELETE' });
        showToast('Board deleted', 'delete');

        if (String(state.activeBoardId) === String(boardId)) {
          state.activeBoardId = null;
          boardTitleEl.textContent = 'No board selected';
          columnsEl.innerHTML = `
            <div class="flex-1 flex items-center justify-center text-on-surface-variant">
              <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-[32px] text-outline">dashboard_customize</span>
                <p class="text-sm font-medium">Select a board from the sidebar</p>
              </div>
            </div>
          `;
        }
        await loadBoards();
      } catch (err) {
        console.error('deleteBoard failed:', err);
        showToast(err.message || 'Could not delete board', 'error');
      }
    });
  }

  //Duplicate Board
  if (ctxDuplicateBoardEl) {
    ctxDuplicateBoardEl.addEventListener('click', async () => {
      const boardId = ctxMenuBoardId;
      closeBoardContextMenu();
      if (!boardId) return;

      const board = state.cachedBoards.find(b => String(b.id) === String(boardId));
      const title = (board && board.title) || 'this board';

      try {
        const data = await api(`/boards/${boardId}/duplicate`, { method: 'POST' });
        showToast(`Duplicated "${title}"`, 'content_copy');
        const newBoard = data && data.board;
        await loadBoards();
        if (newBoard && newBoard.id) {
          state.activeBoardId = newBoard.id;
          renderBoardList();
          await loadBoardData(newBoard.id);
        }
      } catch (err) {
        if (err.message === 'Unauthorized') return;
        console.error('duplicateBoard failed:', err);
        showToast(err.message || 'Could not duplicate board', 'error');
      }
    });
  }

  if (ctxLeaveBoardEl) {
    ctxLeaveBoardEl.addEventListener('click', async () => {
      const boardId = ctxMenuBoardId;
      closeBoardContextMenu();
      if (!boardId) return;

      const board = state.cachedBoards.find(b => String(b.id) === String(boardId));
      const title = (board && board.title) || 'this board';
      if (!confirm(`Leave "${title}"?\n\nYou will no longer see this board in your sidebar.`)) return;

      try {
        await api(`/boards/${boardId}/leave`, { method: 'DELETE' });
        showToast('Left board', 'logout');

        if (String(state.activeBoardId) === String(boardId)) {
          state.activeBoardId = null;
          boardTitleEl.textContent = 'No board selected';
          columnsEl.innerHTML = `
            <div class="flex-1 flex items-center justify-center text-on-surface-variant">
              <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-[32px] text-outline">dashboard_customize</span>
                <p class="text-sm font-medium">Select a board from the sidebar</p>
              </div>
            </div>
          `;
        }
        await loadBoards();
      } catch (err) {
        console.error('leaveBoard failed:', err);
        showToast(err.message || 'Could not leave board', 'error');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!boardCtxMenuEl || boardCtxMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('#board-context-menu')) return;
    closeBoardContextMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!boardCtxMenuEl || boardCtxMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('.board-list-item')) return;
    closeBoardContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBoardContextMenu();
  });
  window.addEventListener('resize',  closeBoardContextMenu);
  window.addEventListener('scroll',  closeBoardContextMenu, true);

  //Inline rename board title
  function canRenameActiveBoard() {
    const board = state.cachedBoards.find(b => String(b.id) === String(state.activeBoardId));
    if (!board) return false;
    const isCreator = state.currentUserId != null && String(board.creator_id) === String(state.currentUserId);
    const isAdmin   = state.currentUserRole === 'admin';
    return isCreator || isAdmin;
  }

  async function commitBoardTitle(originalTitle) {
    const boardId = state.activeBoardId;
    if (!boardId) return;
    const next = boardTitleEl.textContent.trim();

    boardTitleEl.removeAttribute('contenteditable');
    boardTitleEl.classList.remove('ring-2', 'ring-indigo-400', 'rounded-lg', 'px-2');

    if (!next) {
      boardTitleEl.textContent = originalTitle;
      return;
    }
    if (next === originalTitle) return;

    try {
      const data = await api(`/boards/${boardId}`, { method: 'PUT', body: { title: next } });
      const updated = data && data.board;
      const finalTitle = (updated && updated.title) || next;
      boardTitleEl.textContent = finalTitle;
      document.title = `${finalTitle} | Pawtry`;
      const cached = state.cachedBoards.find(b => String(b.id) === String(boardId));
      if (cached) cached.title = finalTitle;
      renderBoardList();
      showToast('Board renamed', 'edit');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to rename board:', err);
      boardTitleEl.textContent = originalTitle;
      showToast(err.message || 'Could not rename board', 'error');
    }
  }

  function startBoardTitleEdit() {
    if (!state.activeBoardId) return;
    if (!canRenameActiveBoard()) {
      showToast('Only the board owner or an admin can rename this board', 'lock');
      return;
    }
    if (boardTitleEl.getAttribute('contenteditable') === 'true') return;

    const original = boardTitleEl.textContent.trim();
    boardTitleEl.setAttribute('contenteditable', 'true');
    boardTitleEl.classList.add('ring-2', 'ring-indigo-400', 'rounded-lg', 'px-2');
    boardTitleEl.focus();

    //Select all
    const range = document.createRange();
    range.selectNodeContents(boardTitleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        boardTitleEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        boardTitleEl.textContent = original;
        boardTitleEl.blur();
      }
    };
    const onBlur = () => {
      boardTitleEl.removeEventListener('keydown', onKey);
      boardTitleEl.removeEventListener('blur', onBlur);
      commitBoardTitle(original);
    };
    boardTitleEl.addEventListener('keydown', onKey);
    boardTitleEl.addEventListener('blur', onBlur);
  }

  if (boardTitleEl) {
    boardTitleEl.style.cursor = 'pointer';
    boardTitleEl.title = 'Click to rename board';
    boardTitleEl.addEventListener('click', startBoardTitleEdit);
  }

  //New Board / Trello import modal
  const nbModal       = document.getElementById('new-board-modal');
  const nbCreateTitle = document.getElementById('nb-create-title');
  const nbCreateBtn   = document.getElementById('nb-create-submit');
  const nbImportFile  = document.getElementById('nb-import-file');
  const nbImportName  = document.getElementById('nb-import-filename');
  const nbImportTitle = document.getElementById('nb-import-title');
  const nbImportBtn   = document.getElementById('nb-import-submit');
  const nbImportStat  = document.getElementById('nb-import-status');
  const nbImportDrop  = document.getElementById('nb-import-drop');

  function openNewBoardModal() {
    if (!nbModal) return;
    nbModal.classList.remove('hidden');
    setTimeout(() => nbCreateTitle && nbCreateTitle.focus(), 50);
  }
  function closeNewBoardModal() {
    if (!nbModal) return;
    nbModal.classList.add('hidden');
    if (nbCreateTitle) nbCreateTitle.value = '';
    if (nbImportFile)  nbImportFile.value  = '';
    if (nbImportTitle) nbImportTitle.value = '';
    if (nbImportName)  nbImportName.textContent = 'Click to choose a .json file';
    if (nbImportBtn)   nbImportBtn.disabled = true;
    if (nbImportStat)  nbImportStat.classList.add('hidden');
    switchNbTab('create');
  }
  function switchNbTab(target) {
    if (!nbModal) return;
    nbModal.querySelectorAll('[data-nb-tab]').forEach(t => {
      const active = t.dataset.nbTab === target;
      t.classList.toggle('border-indigo-600', active);
      t.classList.toggle('text-indigo-700',   active);
      t.classList.toggle('border-transparent',!active);
      t.classList.toggle('text-gray-500',     !active);
    });
    nbModal.querySelectorAll('[data-nb-panel]').forEach(p => {
      p.classList.toggle('hidden', p.dataset.nbPanel !== target);
    });
  }

  if (nbModal) {
    nbModal.querySelectorAll('[data-nb-close]').forEach(el => el.addEventListener('click', closeNewBoardModal));
    nbModal.querySelectorAll('[data-nb-tab]').forEach(t => t.addEventListener('click', () => switchNbTab(t.dataset.nbTab)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !nbModal.classList.contains('hidden')) closeNewBoardModal();
    });
  }

  //Create tab
  async function submitCreateBoard() {
    const title = (nbCreateTitle?.value || '').trim();
    if (!title) {
      nbCreateTitle?.focus();
      showToast('Board title cannot be empty', 'error');
      return;
    }
    nbCreateBtn.disabled = true;
    try {
      const data = await api('/boards', { method: 'POST', body: { title } });
      const newBoard = data && data.board;
      if (!newBoard) throw new Error('Server did not return the new board');

      state.activeBoardId = newBoard.id;
      closeNewBoardModal();
      await loadBoards();
      await loadBoardData(newBoard.id);
      showToast('Board created', 'add');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to create board:', err);
      showToast('Could not create board: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      nbCreateBtn.disabled = false;
    }
  }
  if (nbCreateBtn)   nbCreateBtn.addEventListener('click', submitCreateBoard);
  if (nbCreateTitle) nbCreateTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateBoard(); });

  //Import tab
  function setImportFile(file) {
    if (!file) {
      if (nbImportName) nbImportName.textContent = 'Click to choose a .json file';
      if (nbImportBtn)  nbImportBtn.disabled = true;
      return;
    }
    if (!/\.json$/i.test(file.name)) {
      showToast('Please choose a .json file', 'error');
      return;
    }
    if (nbImportName) nbImportName.textContent = `${file.name} (${Math.round(file.size/1024)} KB)`;
    if (nbImportBtn)  nbImportBtn.disabled = false;
  }
  if (nbImportFile) {
    nbImportFile.addEventListener('change', () => setImportFile(nbImportFile.files && nbImportFile.files[0]));
  }
  if (nbImportDrop) {
    ['dragover','dragenter'].forEach(ev => nbImportDrop.addEventListener(ev, (e) => { e.preventDefault(); nbImportDrop.classList.add('border-indigo-500','bg-indigo-50'); }));
    ['dragleave','drop'].forEach(ev => nbImportDrop.addEventListener(ev, (e) => { e.preventDefault(); nbImportDrop.classList.remove('border-indigo-500','bg-indigo-50'); }));
    nbImportDrop.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const dt = new DataTransfer();
      dt.items.add(f);
      nbImportFile.files = dt.files;
      setImportFile(f);
    });
  }

  async function submitImportTrello() {
    const file = nbImportFile && nbImportFile.files && nbImportFile.files[0];
    if (!file) {
      showToast('Please choose a Trello JSON file', 'error');
      return;
    }
    const overrideTitle = (nbImportTitle?.value || '').trim();

    nbImportBtn.disabled = true;
    if (nbImportStat) {
      nbImportStat.textContent = 'Uploading and parsing…';
      nbImportStat.classList.remove('hidden');
    }
    try {
      const fd = new FormData();
      fd.append('trello_json', file);
      if (overrideTitle) fd.append('title', overrideTitle);

      const token = localStorage.getItem('token');
      const res = await fetch(`${window.APP_CONFIG.API_BASE}/boards/import/trello`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || `Import failed (HTTP ${res.status})`);
      }

      const newBoard = json.data && json.data.board;
      const stats    = (json.data && json.data.stats) || {};
      closeNewBoardModal();
      showToast(`Imported: ${stats.columns||0} columns, ${stats.tasks||0} tasks`, 'cloud_done');
      if (newBoard && newBoard.id) {
        state.activeBoardId = newBoard.id;
        await loadBoards();
        await loadBoardData(newBoard.id);
      }
    } catch (err) {
      console.error('Trello import failed:', err);
      if (nbImportStat) {
        nbImportStat.textContent = `Failed: ${err.message || 'unknown error'}`;
        nbImportStat.classList.remove('hidden');
      }
      showToast(err.message || 'Could not import Trello board', 'error');
      nbImportBtn.disabled = false;
    }
  }
  if (nbImportBtn) nbImportBtn.addEventListener('click', submitImportTrello);

  newBoardBtn.addEventListener('click', openNewBoardModal);

  D.loadBoards            = loadBoards;
  D.renderBoardList       = renderBoardList;
  D.openBoardContextMenu  = openBoardContextMenu;
  D.closeBoardContextMenu = closeBoardContextMenu;
})();
