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
        } else if (!draggingColumnId) {
          colEl.classList.add('column-drag-over');
        }
      });

      colEl.addEventListener('dragleave', (e) => {
        if (!colEl.contains(e.relatedTarget)) {
          colEl.classList.remove('column-drag-over');
          colEl.classList.remove('column-drop-indicator');
        }
      });

      colEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        colEl.classList.remove('column-drag-over');
        colEl.classList.remove('column-drop-indicator');

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

        if (String(sourceColumnId) === String(targetColumnId)) return;

        const card = columnsEl.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (!card) return;

        const targetPlaceholder = dropZone.querySelector('.empty-placeholder');
        if (targetPlaceholder) targetPlaceholder.remove();

        card.dataset.columnId = targetColumnId;
        dropZone.appendChild(card);

        const sourceColEl = columnsEl.querySelector(`.kanban-column[data-column-id="${sourceColumnId}"]`);
        if (sourceColEl && D.updateColumnBadge) D.updateColumnBadge(sourceColEl);
        if (D.updateColumnBadge) D.updateColumnBadge(colEl);

        try {
          await api(`/tasks/${taskId}`, {
            method: 'PUT',
            body: { column_id: targetColumnId },
          });
        } catch (err) {
          console.error('Failed to move task:', err);
          alert('ย้าย Task ไม่สำเร็จ: ' + (err.message || 'Unknown error') + '\nจะโหลดบอร์ดใหม่เพื่อให้ตรงกับฐานข้อมูล');
          loadBoardData(state.activeBoardId);
        }
      });
    });
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

  (function setupBoardPan() {
    const PAN_THRESHOLD = 5;
    const INTERACTIVE_SELECTOR = '.task-card, button, a, input, textarea, select, [draggable="true"], .column-drag-handle';

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

      const dx = e.pageX - startPageX;

      if (!isPanning) {
        if (Math.abs(dx) < PAN_THRESHOLD) return;
        isPanning = true;
        columnsEl.classList.add('is-panning');
      }

      e.preventDefault();
      columnsEl.scrollLeft = startScrollLeft - dx;
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
  })();

  D.setupDragAndDrop = setupDragAndDrop;
})();
