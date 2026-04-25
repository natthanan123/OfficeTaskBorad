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

    boardListEl.innerHTML = state.cachedBoards.map(b => {
      const isActive = String(b.id) === String(state.activeBoardId);
      const stateClasses = isActive
        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-semibold border-r-2 border-indigo-600'
        : 'text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20';
      return `
        <li>
          <button type="button"
                  class="board-list-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${stateClasses}"
                  data-board-id="${escapeHtml(b.id)}"
                  title="${escapeHtml(b.title || 'Untitled')}">
            <span class="material-symbols-outlined text-base shrink-0">view_kanban</span>
            <span class="truncate flex-1">${escapeHtml(b.title || 'Untitled')}</span>
          </button>
        </li>
      `;
    }).join('');

    boardListEl.querySelectorAll('.board-list-item').forEach(btn => {
      btn.addEventListener('click', () => {
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

    // Admins can delete any board; others must be the creator
    const isCreator = state.currentUserId != null && String(board.creator_id) === String(state.currentUserId);
    const isAdmin   = state.currentUserRole === 'admin';
    const canDelete = isCreator || isAdmin;
    ctxDeleteBoardEl.classList.toggle('hidden', !canDelete);
    // Only non-creators see "Leave"; admins on someone else's board still see Delete (and may see Leave too if they joined)
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

  // Duplicate Board context-menu action
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

  // Double-click board title in header to rename it
  if (boardTitleEl) {
    boardTitleEl.style.cursor = 'pointer';
    boardTitleEl.title = 'Double-click to rename board';
    boardTitleEl.addEventListener('dblclick', async () => {
      const boardId = state.activeBoardId;
      if (!boardId) return;

      const current = boardTitleEl.textContent.trim();
      const raw = prompt('Rename board:', current);
      if (raw === null) return;
      const title = raw.trim();
      if (!title || title === current) return;

      try {
        const data = await api(`/boards/${boardId}`, { method: 'PUT', body: { title } });
        const updated = data && data.board;
        if (updated) {
          boardTitleEl.textContent = updated.title;
          document.title = `${updated.title} | Pawtry`;
          // Sync sidebar list
          const cached = state.cachedBoards.find(b => String(b.id) === String(boardId));
          if (cached) cached.title = updated.title;
          renderBoardList();
        }
        showToast('Board renamed', 'edit');
      } catch (err) {
        if (err.message === 'Unauthorized') return;
        console.error('Failed to rename board:', err);
        showToast(err.message || 'Could not rename board', 'error');
      }
    });
  }

  newBoardBtn.addEventListener('click', async () => {
    const raw = prompt('Enter new board title:');
    if (raw === null) return;
    const title = raw.trim();
    if (!title) {
      alert('Board title cannot be empty');
      return;
    }

    newBoardBtn.disabled = true;
    try {
      const data = await api('/boards', { method: 'POST', body: { title } });
      const newBoard = data && data.board;
      if (!newBoard) throw new Error('Server did not return the new board');

      state.activeBoardId = newBoard.id;
      await loadBoards();
      await loadBoardData(newBoard.id);
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('Failed to create board:', err);
      alert('Could not create board: ' + (err.message || 'Unknown error'));
    } finally {
      newBoardBtn.disabled = false;
    }
  });

  D.loadBoards            = loadBoards;
  D.renderBoardList       = renderBoardList;
  D.openBoardContextMenu  = openBoardContextMenu;
  D.closeBoardContextMenu = closeBoardContextMenu;
})();
