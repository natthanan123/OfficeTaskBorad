(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[TaskMentions] window.Dashboard is missing');
    return;
  }

  const escapeHtml = D.escapeHtml;
  const initials   = D.initials;
  const colorFor   = D.colorFor;

  const mentionMenu = document.getElementById('pawtry-mention-menu');
  if (!mentionMenu) return;

  let mentionActiveQuill = null;
  let mentionStartIndex  = -1;
  let mentionFilteredUsers = [];
  let mentionFocusedIdx  = 0;

  // Attach to a Quill instance (idempotent)
  function attachMentionSupport(quillInstance) {
    if (!quillInstance || quillInstance._pawtryMentionWired) return;
    quillInstance._pawtryMentionWired = true;

    quillInstance.on('text-change', (delta, oldDelta, source) => {
      if (source !== 'user') return;
      onMentionTextChange(quillInstance);
    });

    quillInstance.keyboard.addBinding({ key: 'Enter' }, () => {
      if (mentionMenu.classList.contains('is-open') && mentionActiveQuill === quillInstance) {
        selectFocusedMention();
        return false;
      }
      return true;
    });
    quillInstance.keyboard.addBinding({ key: 'ArrowDown' }, () => {
      if (mentionMenu.classList.contains('is-open') && mentionActiveQuill === quillInstance) {
        moveMentionFocus(1);
        return false;
      }
      return true;
    });
    quillInstance.keyboard.addBinding({ key: 'ArrowUp' }, () => {
      if (mentionMenu.classList.contains('is-open') && mentionActiveQuill === quillInstance) {
        moveMentionFocus(-1);
        return false;
      }
      return true;
    });
    quillInstance.keyboard.addBinding({ key: 'Escape' }, () => {
      if (mentionMenu.classList.contains('is-open') && mentionActiveQuill === quillInstance) {
        closeMentionMenu();
        return false;
      }
      return true;
    });
  }

  function onMentionTextChange(quillInstance) {
    const sel = quillInstance.getSelection();
    if (!sel) return;
    const text = quillInstance.getText(0, sel.index);
    const atMatch = text.match(/(^|[\s\n\r])@([a-zA-Z0-9ก-๙฀-๿._\- ]{0,30})$/);
    if (!atMatch) { closeMentionMenu(); return; }

    const query = atMatch[2];
    mentionActiveQuill = quillInstance;
    const prefixLen = atMatch[1] ? atMatch[1].length : 0;
    mentionStartIndex = atMatch.index + prefixLen;

    openMentionMenu(query);
  }

  // Picker menu
  function openMentionMenu(query) {
    const members = (D.getBoardMembersCache && D.getBoardMembersCache()) || [];
    const q = (query || '').toLowerCase().trim();
    mentionFilteredUsers = members.filter(u => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return !q || name.includes(q) || email.includes(q);
    }).slice(0, 8);

    if (!mentionFilteredUsers.length) { closeMentionMenu(); return; }
    mentionFocusedIdx = 0;
    renderMentionMenu();
    positionMentionMenu();
    mentionMenu.classList.add('is-open');
  }

  function renderMentionMenu() {
    mentionMenu.innerHTML = mentionFilteredUsers.map((u, idx) => {
      const name = escapeHtml(u.full_name || u.email || '');
      return `<div class="pawtry-mention-item ${idx === mentionFocusedIdx ? 'is-focused' : ''}" data-mention-user-id="${escapeHtml(String(u.id))}">
        <span class="pawtry-mention-item__avatar" style="background:${colorFor(u.email || u.id || u.full_name)}">${escapeHtml(initials(u.full_name || u.email))}</span>
        <span class="pawtry-mention-item__name">${name}</span>
      </div>`;
    }).join('');
  }

  function positionMentionMenu() {
    if (!mentionActiveQuill) return;
    try {
      const bounds = mentionActiveQuill.getBounds(mentionStartIndex);
      const rootRect = mentionActiveQuill.root.getBoundingClientRect();
      mentionMenu.style.top = `${rootRect.top + bounds.top + bounds.height + 4}px`;
      mentionMenu.style.left = `${rootRect.left + bounds.left}px`;
      const vw = window.innerWidth;
      const menuW = mentionMenu.offsetWidth || 220;
      if (rootRect.left + bounds.left + menuW > vw - 16) {
        mentionMenu.style.left = `${Math.max(8, vw - menuW - 16)}px`;
      }
    } catch (e) { /* ignore */ }
  }

  function moveMentionFocus(dir) {
    if (!mentionFilteredUsers.length) return;
    mentionFocusedIdx = (mentionFocusedIdx + dir + mentionFilteredUsers.length) % mentionFilteredUsers.length;
    renderMentionMenu();
  }

  function selectFocusedMention() {
    const user = mentionFilteredUsers[mentionFocusedIdx];
    if (!user) return;
    insertMentionIntoQuill(user);
    closeMentionMenu();
  }

  function insertMentionIntoQuill(user) {
    if (!mentionActiveQuill || mentionStartIndex < 0) return;
    const q = mentionActiveQuill;
    const sel = q.getSelection();
    if (!sel) return;

    const queryLen = sel.index - mentionStartIndex;
    q.deleteText(mentionStartIndex, queryLen, Quill.sources.USER);

    const name = escapeHtml(user.full_name || user.email || '');
    const uid  = escapeHtml(String(user.id));
    const html = `<span class="pawtry-mention" data-mention="${uid}">@${name}</span>&nbsp;`;

    const delta = q.clipboard.convert(html);
    q.updateContents(
      new (Quill.import('delta'))()
        .retain(mentionStartIndex)
        .concat(delta),
      Quill.sources.USER
    );
    q.setSelection(mentionStartIndex + (delta.length() || 1), Quill.sources.SILENT);
  }

  function closeMentionMenu() {
    mentionMenu.classList.remove('is-open');
    mentionMenu.innerHTML = '';
    mentionActiveQuill = null;
    mentionStartIndex  = -1;
    mentionFilteredUsers = [];
  }

  // Click selection
  mentionMenu.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('[data-mention-user-id]');
    if (!item) return;
    const user = mentionFilteredUsers.find(u => String(u.id) === item.dataset.mentionUserId);
    if (user) { insertMentionIntoQuill(user); closeMentionMenu(); }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (e.target.closest('#pawtry-mention-menu')) return;
    if (e.target.closest('#modal-comment-quill')) return;
    if (e.target.closest('[data-reply-editor]')) return;
    if (e.target.closest('.pawtry-reply-toolbar')) return;
    if (e.target.closest('.pawtry-popup')) return;
    closeMentionMenu();
  });

  D.attachMentionSupport = attachMentionSupport;
  D.closeMentionMenu     = closeMentionMenu;
})();
