// ════════════════════════════════════════════════════════════════════
//  log_page.js — Activity Log "Timeline" tab for the Kanban dashboard
// --------------------------------------------------------------------
//  Reads helpers + cached board state from window.Dashboard (exposed
//  at the end of code.html's main IIFE) so the two files stay decoupled.
//  Required surface:
//    Dashboard.api(path, opts)
//    Dashboard.escapeHtml(str)
//    Dashboard.formatNotificationTime(iso)
//    Dashboard.showToast(msg, icon)
//    Dashboard.getActiveBoardId()
//    Dashboard.getColumnById(id)  → { id, title, ... } | null
//    Dashboard.getTaskById(id)    → { id, title, ... } | null
//    Dashboard.getLabelById(id)   → { id, title, color } | null
//    Dashboard.getMemberById(id)  → { id, full_name, email } | null
//  The main script also dispatches a 'dashboard:board-loaded' window
//  CustomEvent after every board switch — we listen for it so the
//  timeline resets + refetches whenever the active board changes.
// ════════════════════════════════════════════════════════════════════

(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[log_page] window.Dashboard is missing — script order?');
    return;
  }

  // ── DOM refs (injected into code.html in Phase 3) ──
  const tabOverviewBtn = document.getElementById('tab-overview');
  const tabTimelineBtn = document.getElementById('tab-timeline');
  const timelineViewEl = document.getElementById('timeline-view');
  const kanbanEl       = document.getElementById('kanban-columns');

  if (!tabOverviewBtn || !tabTimelineBtn || !timelineViewEl || !kanbanEl) {
    console.error('[log_page] Required tab/view elements missing.');
    return;
  }

  // Siblings of #kanban-columns inside <main> that should be hidden along
  // with the board canvas when Timeline is active. Collected lazily.
  const kanbanLoadingEl = document.getElementById('kanban-loading');

  // Which board the currently-rendered timeline belongs to. Cleared when
  // the user switches boards so the next tab activation always refetches.
  let renderedForBoardId = null;
  let isTimelineVisible  = false;

  // ═══════════════════════════════════════════
  //  Tab switching
  // ═══════════════════════════════════════════

  const ACTIVE_CLASSES   = ['text-indigo-600', 'dark:text-indigo-400', 'border-b-2', 'border-indigo-600'];
  const INACTIVE_CLASSES = ['text-slate-500', 'dark:text-slate-400', 'hover:text-indigo-700', 'dark:hover:text-indigo-300', 'transition-opacity'];

  function markActive(btn) {
    btn.classList.add(...ACTIVE_CLASSES);
    INACTIVE_CLASSES.forEach(c => btn.classList.remove(c));
  }
  function markInactive(btn) {
    btn.classList.add(...INACTIVE_CLASSES);
    ACTIVE_CLASSES.forEach(c => btn.classList.remove(c));
  }

  function showOverview() {
    timelineViewEl.classList.add('hidden');
    kanbanEl.classList.remove('hidden');
    if (kanbanLoadingEl) kanbanLoadingEl.classList.remove('hidden');
    markActive(tabOverviewBtn);
    markInactive(tabTimelineBtn);
    isTimelineVisible = false;
  }

  function showTimeline() {
    // Hide the whole Kanban canvas so the Timeline gets full width and
    // the user doesn't see a half-rendered board underneath.
    kanbanEl.classList.add('hidden');
    if (kanbanLoadingEl) kanbanLoadingEl.classList.add('hidden');
    timelineViewEl.classList.remove('hidden');
    markActive(tabTimelineBtn);
    markInactive(tabOverviewBtn);
    isTimelineVisible = true;

    const boardId = D.getActiveBoardId();
    if (!boardId) {
      timelineViewEl.innerHTML = emptyState('ยังไม่ได้เลือกบอร์ด', 'dashboard_customize');
      renderedForBoardId = null;
      return;
    }

    // Always refetch on tab open — activity is typically stale.
    fetchAndRenderLogs(boardId);
  }

  tabOverviewBtn.addEventListener('click', (e) => { e.preventDefault(); showOverview(); });
  tabTimelineBtn.addEventListener('click', (e) => { e.preventDefault(); showTimeline(); });

  // When the user switches boards from the sidebar, reset state and
  // (if we're currently looking at the timeline) reload for the new board.
  window.addEventListener('dashboard:board-loaded', (e) => {
    const newBoardId = (e && e.detail && e.detail.boardId) || D.getActiveBoardId();

    // Different board → blow away the previous render so nothing leaks.
    if (String(newBoardId) !== String(renderedForBoardId)) {
      renderedForBoardId = null;
      if (isTimelineVisible) {
        timelineViewEl.innerHTML = loadingState();
        if (newBoardId) fetchAndRenderLogs(newBoardId);
      } else {
        timelineViewEl.innerHTML = '';
      }
    } else if (isTimelineVisible && newBoardId) {
      // Same board, but caches were just repopulated — re-resolve names.
      fetchAndRenderLogs(newBoardId);
    }
  });

  // ═══════════════════════════════════════════
  //  Fetching + rendering
  // ═══════════════════════════════════════════

  async function fetchAndRenderLogs(boardId) {
    // Board isolation: snapshot the id we're fetching for and bail out
    // during the render step if the user has switched boards meanwhile.
    const requestedBoardId = boardId;
    timelineViewEl.innerHTML = loadingState();

    try {
      const data = await D.api(`/boards/${requestedBoardId}/logs?limit=100`);

      // Abort if the user jumped to a different board while we were in-flight.
      if (String(requestedBoardId) !== String(D.getActiveBoardId())) return;

      const logs = (data && data.logs) || [];
      renderedForBoardId = requestedBoardId;

      if (!logs.length) {
        timelineViewEl.innerHTML = emptyState('ยังไม่มีกิจกรรมในบอร์ดนี้', 'history');
        return;
      }

      timelineViewEl.innerHTML = renderTimeline(logs);
    } catch (err) {
      if (err && err.message === 'Unauthorized') return;
      console.error('[log_page] fetchAndRenderLogs failed:', err);
      timelineViewEl.innerHTML = `
        <div class="flex-1 flex items-center justify-center text-error py-12">
          <div class="flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-[32px]">error</span>
            <p class="text-sm font-medium">ไม่สามารถโหลดประวัติกิจกรรมได้</p>
            <p class="text-xs opacity-70">${D.escapeHtml(err.message || 'Unknown error')}</p>
          </div>
        </div>
      `;
    }
  }

  // ═══════════════════════════════════════════
  //  Presentation helpers
  // ═══════════════════════════════════════════

  function loadingState() {
    return `
      <div class="flex-1 flex items-center justify-center py-12 text-on-surface-variant">
        <div class="flex flex-col items-center gap-3">
          <span class="material-symbols-outlined text-primary animate-spin text-[32px]">progress_activity</span>
          <p class="text-sm font-medium">กำลังโหลดกิจกรรม...</p>
        </div>
      </div>
    `;
  }

  function emptyState(message, icon = 'history') {
    return `
      <div class="flex-1 flex items-center justify-center py-12 text-on-surface-variant">
        <div class="flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[32px] text-outline">${D.escapeHtml(icon)}</span>
          <p class="text-sm font-medium">${D.escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  function renderTimeline(logs) {
    const items = logs.map(renderLogItem).join('');
    return `
      <div class="max-w-3xl mx-auto">
        <h2 class="text-2xl font-extrabold tracking-tight text-on-surface mb-1">ประวัติกิจกรรม</h2>
        <p class="text-xs text-on-surface-variant mb-6">${logs.length} รายการล่าสุด</p>
        <ol class="relative border-l-2 border-outline-variant/30 pl-6 space-y-5">
          ${items}
        </ol>
      </div>
    `;
  }

  function renderLogItem(log) {
    const meta    = describeAction(log);
    const actor   = (log.user && (log.user.full_name || log.user.email)) || 'ผู้ใช้';
    const initial = (actor[0] || '?').toUpperCase();
    const when    = D.formatNotificationTime(log.created_at);

    return `
      <li class="relative">
        <span class="absolute -left-[34px] top-0 flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-highest border-2 border-outline-variant/30 shadow-sm">
          <span class="material-symbols-outlined text-base ${D.escapeHtml(meta.iconClass)}">${D.escapeHtml(meta.icon)}</span>
        </span>
        <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">${D.escapeHtml(initial)}</span>
              <p class="text-sm text-on-surface leading-snug min-w-0">
                <span class="font-semibold">${D.escapeHtml(actor)}</span>
                <span class="text-on-surface-variant"> ${meta.verbHtml}</span>
              </p>
            </div>
            <span class="text-[11px] text-on-surface-variant whitespace-nowrap shrink-0">${D.escapeHtml(when)}</span>
          </div>
        </div>
      </li>
    `;
  }

  // ═══════════════════════════════════════════
  //  ID → Name resolution (never renders raw IDs)
  // ═══════════════════════════════════════════

  // Wrap a resolved (or fallback) name in a bold chip so the user's eye
  // lands on the "thing" before the verb.
  function nameChip(text) {
    return `<span class="font-semibold text-on-surface">${D.escapeHtml(text)}</span>`;
  }

  // Task name: try the live cache first, then the embedded log.task.title
  // that the backend include'd, then the MOVE_TASK details snapshot, then
  // the deleted-task fallback.
  function resolveTaskName(log) {
    const details = log.details || {};
    const liveId  = log.task_id || (log.task && log.task.id);
    if (liveId) {
      const cached = D.getTaskById(liveId);
      if (cached && cached.title) return cached.title;
    }
    if (log.task && log.task.title) return log.task.title;     // included by API
    if (details.title)              return details.title;      // snapshot at CREATE_TASK
    return '[การ์ดที่ถูกลบ]';
  }

  function resolveColumnName(columnId) {
    if (!columnId) return '[คอลัมน์ที่ถูกลบ]';
    const cached = D.getColumnById(columnId);
    if (cached && cached.title) return cached.title;
    return '[คอลัมน์ที่ถูกลบ]';
  }

  function resolveLabelName(labelId) {
    if (!labelId) return '[ป้ายที่ถูกลบ]';
    const cached = D.getLabelById(labelId);
    if (cached && (cached.title || cached.color)) {
      return cached.title || cached.color;
    }
    return '[ป้ายที่ถูกลบ]';
  }

  function resolveMemberName(userId) {
    if (!userId) return '[สมาชิกที่ถูกลบ]';
    const cached = D.getMemberById(userId);
    if (cached) return cached.full_name || cached.email;
    return '[สมาชิกที่ถูกลบ]';
  }

  // Map each backend action_type → a Thai sentence with bold names.
  function describeAction(log) {
    const details = log.details || {};

    switch (log.action_type) {
      case 'CREATE_TASK': {
        const taskName   = resolveTaskName(log);
        const columnName = resolveColumnName(details.column_id);
        return {
          icon: 'add_task',
          iconClass: 'text-primary',
          verbHtml: `สร้างการ์ด ${nameChip(taskName)} ในคอลัมน์ ${nameChip(columnName)}`,
        };
      }

      case 'MOVE_TASK': {
        const taskName = resolveTaskName(log);
        const fromName = resolveColumnName(details.from_column);
        const toName   = resolveColumnName(details.to_column);
        return {
          icon: 'swap_horiz',
          iconClass: 'text-indigo-500',
          verbHtml: `ย้ายการ์ด ${nameChip(taskName)} จาก ${nameChip(fromName)} ไปยัง ${nameChip(toName)}`,
        };
      }

      case 'UPDATE_STATUS': {
        const taskName = resolveTaskName(log);
        const done     = !!details.is_completed;
        return {
          icon: done ? 'check_circle' : 'radio_button_unchecked',
          iconClass: done ? 'text-green-500' : 'text-on-surface-variant',
          verbHtml: done
            ? `ทำเครื่องหมายการ์ด ${nameChip(taskName)} ว่า ${nameChip('เสร็จสิ้น (Complete)')}`
            : `เปลี่ยนสถานะการ์ด ${nameChip(taskName)} เป็น ${nameChip('ยังไม่เสร็จ')}`,
        };
      }

      case 'ADD_COMMENT': {
        const taskName = resolveTaskName(log);
        return {
          icon: 'chat_bubble',
          iconClass: 'text-blue-500',
          verbHtml: `คอมเมนต์ในการ์ด ${nameChip(taskName)}`,
        };
      }

      case 'UPDATE_DESCRIPTION': {
        const taskName = resolveTaskName(log);
        return {
          icon: 'edit_note',
          iconClass: 'text-cyan-500',
          verbHtml: `แก้ไขรายละเอียด (Description) ของการ์ด ${nameChip(taskName)}`,
        };
      }

      case 'DELETE_TASK': {
        // task_id is null after a delete, so resolveTaskName falls back to
        // details.title (snapshot taken on the server before destroy).
        const taskName = (details && details.title) || '[การ์ดที่ถูกลบ]';
        return {
          icon: 'delete',
          iconClass: 'text-error',
          verbHtml: `ลบการ์ด ${nameChip(taskName)} ออกจากบอร์ด`,
        };
      }

      case 'DELETE_COLUMN': {
        const columnName = (details && details.title) || '[คอลัมน์ที่ถูกลบ]';
        return {
          icon: 'delete_sweep',
          iconClass: 'text-error',
          verbHtml: `ลบคอลัมน์ ${nameChip(columnName)} ออกจากบอร์ด`,
        };
      }

      case 'TOGGLE_LABEL': {
        const taskName  = resolveTaskName(log);
        const labelName = resolveLabelName(details.label_id);
        return {
          icon: 'label',
          iconClass: 'text-pink-500',
          verbHtml: details.attached
            ? `ติดป้าย ${nameChip(labelName)} ให้กับการ์ด ${nameChip(taskName)}`
            : `ถอดป้าย ${nameChip(labelName)} ออกจากการ์ด ${nameChip(taskName)}`,
        };
      }

      case 'ASSIGN_MEMBER': {
        const taskName   = resolveTaskName(log);
        const memberName = resolveMemberName(details.target_user_id);
        return {
          icon: 'person_add',
          iconClass: 'text-amber-500',
          verbHtml: details.assigned
            ? `มอบหมายการ์ด ${nameChip(taskName)} ให้ ${nameChip(memberName)}`
            : `ปลดมอบหมาย ${nameChip(memberName)} ออกจากการ์ด ${nameChip(taskName)}`,
        };
      }

      case 'ADD_MEMBER': {
        const memberName = resolveMemberName(details.target_user_id);
        return {
          icon: 'group_add',
          iconClass: 'text-emerald-500',
          verbHtml: `เพิ่มสมาชิก ${nameChip(memberName)} เข้าบอร์ด`,
        };
      }

      default:
        return {
          icon: 'bolt',
          iconClass: 'text-on-surface-variant',
          verbHtml: `ดำเนินการ ${nameChip(log.action_type || 'กิจกรรม')}`,
        };
    }
  }

  // Opt-in hook for future callers (e.g. live socket updates) that want
  // the visible timeline to refresh without a manual tab click.
  window.Dashboard.refreshTimeline = () => {
    const boardId = D.getActiveBoardId();
    if (boardId && isTimelineVisible) fetchAndRenderLogs(boardId);
  };
})();
