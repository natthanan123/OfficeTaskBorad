(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[KanbanDragDrop] window.Dashboard is missing — script order?');
    return;
  }

  const api           = D.api;
  const state         = D.state;
  const loadBoardData = D.loadBoardData;
  const columnsEl     = D.getColumnsEl();

  function setupDragAndDrop() {
    columnsEl.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          kind: 'task',
          taskId: card.dataset.taskId,
          sourceColumnId: card.dataset.columnId,
        }));
        requestAnimationFrame(() => card.classList.add('task-card-dragging'));
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('task-card-dragging');
        columnsEl.querySelectorAll('.column-drag-over').forEach(c => c.classList.remove('column-drag-over'));
      });
    });

    //Drag Column setup
    setupColumnDragHandles();

    columnsEl.querySelectorAll('.kanban-column').forEach(colEl => {
      const dropZone = colEl.querySelector('.kanban-drop-zone');
      if (!dropZone) return;

      colEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggingColumnId && String(draggingColumnId) !== String(colEl.dataset.columnId)) {
          colEl.classList.add('column-drop-indicator');
          return;
        }
        if (!draggingColumnId) {
          colEl.classList.add('column-drag-over');
          updateTaskDropIndicator(dropZone, e.clientY);
        }
      });

      colEl.addEventListener('dragleave', (e) => {
        if (!colEl.contains(e.relatedTarget)) {
          colEl.classList.remove('column-drag-over');
          colEl.classList.remove('column-drop-indicator');
          clearTaskDropIndicator(dropZone);
        }
      });

      colEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        colEl.classList.remove('column-drag-over');
        colEl.classList.remove('column-drop-indicator');
        clearTaskDropIndicator(dropZone);

        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

        //Drag Column drop
        if (data.kind === 'column') {
          const sourceId = data.columnId;
          const targetId = colEl.dataset.columnId;
          if (!sourceId || !targetId || String(sourceId) === String(targetId)) return;
          const rect = colEl.getBoundingClientRect();
          const dropBefore = (e.clientX - rect.left) < (rect.width / 2);
          await applyColumnReorder(sourceId, targetId, dropBefore);
          return;
        }

        //Task drop
        const { taskId, sourceColumnId } = data;
        const targetColumnId = colEl.dataset.columnId;

        const card = columnsEl.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (!card) return;

        const targetPlaceholder = dropZone.querySelector('.empty-placeholder');
        if (targetPlaceholder) targetPlaceholder.remove();

        const referenceCard = findInsertReference(dropZone, e.clientY, card);
        const sameColumn = String(sourceColumnId) === String(targetColumnId);

        if (referenceCard) {
          dropZone.insertBefore(card, referenceCard);
        } else {
          dropZone.appendChild(card);
        }
        card.dataset.columnId = targetColumnId;

        if (!sameColumn) {
          const sourceColEl = columnsEl.querySelector(`.kanban-column[data-column-id="${sourceColumnId}"]`);
          if (sourceColEl && D.updateColumnBadge) D.updateColumnBadge(sourceColEl);
        }
        if (D.updateColumnBadge) D.updateColumnBadge(colEl);

        await persistTaskOrder(taskId, targetColumnId, dropZone, sameColumn ? null : sourceColumnId);
      });
    });
  }

  //Task vertical reorder helpers
  function findInsertReference(dropZone, clientY, draggingCard) {
    const cards = [...dropZone.querySelectorAll('.task-card')].filter(c => c !== draggingCard);
    for (const c of cards) {
      const rect = c.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return c;
    }
    return null;
  }

  function updateTaskDropIndicator(dropZone, clientY) {
    clearTaskDropIndicator(dropZone);
    const dragging = dropZone.querySelector('.task-card-dragging') || columnsEl.querySelector('.task-card-dragging');
    const ref = findInsertReference(dropZone, clientY, dragging);
    if (ref) ref.classList.add('task-drop-before');
    else {
      const cards = dropZone.querySelectorAll('.task-card');
      const last = cards[cards.length - 1];
      if (last) last.classList.add('task-drop-after');
    }
  }

  function clearTaskDropIndicator(dropZone) {
    dropZone.querySelectorAll('.task-drop-before, .task-drop-after').forEach(el => {
      el.classList.remove('task-drop-before');
      el.classList.remove('task-drop-after');
    });
  }

  async function persistTaskOrder(taskId, targetColumnId, dropZone, sourceColumnIdToReorder) {
    const cards = [...dropZone.querySelectorAll('.task-card')];
    const idx = cards.findIndex(c => c.dataset.taskId === String(taskId));
    if (idx === -1) return;
    try {
      await api(`/tasks/${taskId}`, {
        method: 'PUT',
        body: { column_id: targetColumnId, position: idx },
      });
      //Renumber siblings to keep contiguous
      for (let i = 0; i < cards.length; i++) {
        if (i === idx) continue;
        const id = cards[i].dataset.taskId;
        if (!id) continue;
        try {
          await api(`/tasks/${id}`, { method: 'PUT', body: { position: i } });
        } catch (e) { console.error('renumber sibling failed:', e); }
      }
      if (sourceColumnIdToReorder) {
        const sourceCol = columnsEl.querySelector(`.kanban-column[data-column-id="${sourceColumnIdToReorder}"]`);
        const sourceDz = sourceCol && sourceCol.querySelector('.kanban-drop-zone');
        if (sourceDz) {
          const sourceCards = [...sourceDz.querySelectorAll('.task-card')];
          for (let i = 0; i < sourceCards.length; i++) {
            const id = sourceCards[i].dataset.taskId;
            if (!id) continue;
            try {
              await api(`/tasks/${id}`, { method: 'PUT', body: { position: i } });
            } catch (e) { console.error('source renumber failed:', e); }
          }
        }
      }
    } catch (err) {
      console.error('Failed to move task:', err);
      alert('ย้าย Task ไม่สำเร็จ: ' + (err.message || 'Unknown error') + '\nจะโหลดบอร์ดใหม่เพื่อให้ตรงกับฐานข้อมูล');
      loadBoardData(state.activeBoardId);
    }
  }

  //Drag Column
  let draggingColumnId = null;

  function setupColumnDragHandles() {
    columnsEl.querySelectorAll('.kanban-column').forEach(colEl => {
      const handle = colEl.querySelector('.column-drag-handle');
      if (!handle) return;

      handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, .column-options-menu, input, a')) return;
        colEl.setAttribute('draggable', 'true');
      });

      const releaseDraggable = () => colEl.setAttribute('draggable', 'false');
      handle.addEventListener('mouseup',    releaseDraggable);
      handle.addEventListener('mouseleave', releaseDraggable);

      colEl.addEventListener('dragstart', (e) => {
        if (e.target.closest('.task-card')) return;
        if (colEl.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
        draggingColumnId = colEl.dataset.columnId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          kind: 'column',
          columnId: draggingColumnId,
        }));
        requestAnimationFrame(() => colEl.classList.add('column-dragging'));
      });

      colEl.addEventListener('dragend', () => {
        draggingColumnId = null;
        colEl.classList.remove('column-dragging');
        colEl.setAttribute('draggable', 'false');
        columnsEl.querySelectorAll('.column-drop-indicator').forEach(c => c.classList.remove('column-drop-indicator'));
      });
    });
  }

  async function applyColumnReorder(sourceId, targetId, dropBefore) {
    const allCols = [...columnsEl.querySelectorAll('.kanban-column')];
    const source = allCols.find(c => c.dataset.columnId === String(sourceId));
    const target = allCols.find(c => c.dataset.columnId === String(targetId));
    if (!source || !target || source === target) return;

    if (dropBefore) {
      target.parentNode.insertBefore(source, target);
    } else {
      target.parentNode.insertBefore(source, target.nextSibling);
    }

    const newOrder = [...columnsEl.querySelectorAll('.kanban-column')];
    try {
      for (let i = 0; i < newOrder.length; i++) {
        const id = newOrder[i].dataset.columnId;
        await api(`/columns/${id}`, { method: 'PUT', body: { position: i } });
      }
    } catch (err) {
      console.error('Failed to reorder columns:', err);
      alert('จัดเรียงคอลัมน์ไม่สำเร็จ: ' + (err.message || 'Unknown error') + '\nจะโหลดบอร์ดใหม่');
      loadBoardData(state.activeBoardId);
    }
  }

  //Fast Scroll — wheel → horizontal scroll on board
  (function setupHorizontalWheel() {
    const SCROLL_MULTIPLIER = 2;
    columnsEl.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.shiftKey) return;
      const target = e.target;
      const dropZone = target.closest && target.closest('.kanban-drop-zone');
      if (dropZone) {
        const canScrollVertical = dropZone.scrollHeight > dropZone.clientHeight + 1;
        if (canScrollVertical) return;
      }
      if (target.closest && target.closest('.mini-popup, .pawtry-popup, #task-modal, #settings-modal, #copy-column-dialog, #copy-task-dialog, #new-board-modal')) {
        return;
      }
      let delta = e.deltaY || e.deltaX;
      if (!delta) return;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= columnsEl.clientWidth;
      e.preventDefault();
      columnsEl.scrollLeft += delta * SCROLL_MULTIPLIER;
    }, { passive: false });
  })();

  //Fast Pan Scroll
  (function setupBoardPan() {
    const PAN_THRESHOLD   = 5;
    const PAN_MULTIPLIER  = 2;
    const INTERACTIVE_SELECTOR = '.task-card, button, a, input, textarea, select, label, [contenteditable="true"], [draggable="true"], .column-drag-handle';

    let pointerDown    = false;
    let isPanning      = false;
    let startPageX     = 0;
    let startScrollLeft = 0;

    columnsEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(INTERACTIVE_SELECTOR)) return;

      pointerDown     = true;
      isPanning       = false;
      startPageX      = e.pageX;
      startScrollLeft = columnsEl.scrollLeft;
    });

    columnsEl.addEventListener('mousemove', (e) => {
      if (!pointerDown) return;

      const rawDx = e.pageX - startPageX;

      if (!isPanning) {
        if (Math.abs(rawDx) < PAN_THRESHOLD) return;
        isPanning = true;
        columnsEl.classList.add('is-panning');
      }

      e.preventDefault();
      columnsEl.scrollLeft = startScrollLeft - rawDx * PAN_MULTIPLIER;
    });

    function endPan() {
      if (!pointerDown) return;
      pointerDown = false;
      if (isPanning) {
        isPanning = false;
        columnsEl.classList.remove('is-panning');
      }
    }

    columnsEl.addEventListener('mouseup',    endPan);
    columnsEl.addEventListener('mouseleave', endPan);
    window.addEventListener('blur',          endPan);
  })();

  D.setupDragAndDrop = setupDragAndDrop;
})();
