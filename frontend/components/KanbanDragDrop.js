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

    columnsEl.querySelectorAll('.kanban-column').forEach(colEl => {
      const dropZone = colEl.querySelector('.kanban-drop-zone');
      if (!dropZone) return;

      colEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        colEl.classList.add('column-drag-over');
      });

      colEl.addEventListener('dragleave', (e) => {
        if (!colEl.contains(e.relatedTarget)) {
          colEl.classList.remove('column-drag-over');
        }
      });

      colEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        colEl.classList.remove('column-drag-over');

        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
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

  (function setupBoardPan() {
    const PAN_THRESHOLD = 5;
    const INTERACTIVE_SELECTOR = '.task-card, button, a, input, textarea, select, [draggable="true"]';

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
