(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[TaskModal] window.Dashboard is missing — script order?');
    return;
  }

  const api               = D.api;
  const escapeHtml        = D.escapeHtml;
  const formatDueDate     = D.formatDueDate;
  const initials          = D.initials;
  const colorFor          = D.colorFor;
  const coverSrc          = D.coverSrc;
  const taskCache         = D.taskCache;
  const getLabels         = D.getBoardLabelsCache;
  const getMembers        = D.getBoardMembersCache;
  const getColumnsEl      = D.getColumnsEl;
  const getUserNameEl     = D.getUserNameEl;
  const renderTaskCard    = D.renderTaskCard;
  const attachSingleCardEvents = D.attachSingleCardEvents;
  const attachSingleCardDrag   = D.attachSingleCardDrag;
  const updateColumnBadge = D.updateColumnBadge;
  const uploadTaskAttachment = D.uploadTaskAttachment;
  const hasFilesPayload   = D.hasFilesPayload;
  const showToast         = D.showToast;

  const modalEl               = document.getElementById('task-modal');
  const modalPanel            = document.getElementById('modal-panel');
  const modalCloseBtn         = document.getElementById('modal-close');
  const modalTitle            = document.getElementById('modal-title');
  const modalDesc             = document.getElementById('modal-desc');
  const modalDue              = document.getElementById('modal-due');
  const modalDueText          = document.getElementById('modal-due-text');
  const modalStatus           = document.getElementById('modal-status');
  const modalBoardName        = document.getElementById('modal-board-name');
  const modalAssignees        = document.getElementById('modal-assignees');
  const modalSaveBtn          = document.getElementById('modal-save');
  const modalDeleteBtn        = document.getElementById('modal-delete');

  const modalMembersSection   = document.getElementById('modal-members-section');
  const modalLabelsSection    = document.getElementById('modal-labels-section');
  const modalLabelsDisplay    = document.getElementById('modal-labels-display');
  const modalDueSection       = document.getElementById('modal-due-section');
  const modalCompleteCheckbox = document.getElementById('modal-complete-checkbox');
  const modalCompleteBadge    = document.getElementById('modal-complete-badge');
  const modalActivitySection  = document.getElementById('modal-activity-section');
  const modalCommentsList     = document.getElementById('modal-comments-list');
  const modalCommentInput     = document.getElementById('modal-comment-input');
  const modalCommentSubmit    = document.getElementById('modal-comment-submit');
  const modalCommentAvatar    = document.getElementById('modal-comment-avatar');
  const modalSidebar          = document.getElementById('modal-sidebar');
  const modalDueInput         = document.getElementById('modal-due-input');
  const modalDueSaveBtn       = document.getElementById('modal-due-save');
  const modalDueClearBtn      = document.getElementById('modal-due-clear');
  const modalCreateLabelBtn   = document.getElementById('modal-create-label-btn');

  const popupLabelsCreate            = document.getElementById('popup-labels-create');
  const popupLabelsCreateTitle       = document.getElementById('popup-labels-create-title');
  const popupLabelsCreateColorPicker = document.getElementById('popup-labels-create-color-picker');
  const popupLabelsCreateSubmit      = document.getElementById('popup-labels-create-submit');
  const popupLabelsCreateCancel      = document.getElementById('popup-labels-create-cancel');

  const labelCtxMenuEl   = document.getElementById('label-context-menu');
  const ctxEditLabelEl   = document.getElementById('ctx-edit-label');
  const ctxDeleteLabelEl = document.getElementById('ctx-delete-label');
  let   ctxMenuLabelId   = null;

  const popupLabelsList  = document.getElementById('popup-labels-list');
  const popupMembersList = document.getElementById('popup-members-list');

  const modalAttachmentsSection = document.getElementById('modal-attachments-section');
  const modalAttachmentsList    = document.getElementById('modal-attachments-list');
  const modalAttachmentsEmpty   = document.getElementById('modal-attachments-empty');
  const popupAttachmentFile     = document.getElementById('popup-attachment-file');
  const popupAttachmentUrl      = document.getElementById('popup-attachment-url');
  const popupAttachmentSubmit   = document.getElementById('popup-attachment-link-submit');
  const popupAttachments        = document.getElementById('popup-attachments');

  if (!modalEl || !modalPanel) {
    console.error('[TaskModal] Required modal elements missing.');
    return;
  }

  let activeTaskId   = null;
  let activeColumnId = null;
  let modalMode      = 'edit';

  const modalEditOnlySections = [
    modalMembersSection,
    modalLabelsSection,
    modalDueSection,
    modalActivitySection,
  ];

  // ─────────────────────────────────────────────
  // Quill rich text editor — Trello-style custom toolbar
  // ─────────────────────────────────────────────
  let quillEditor = null;
  let customToolbarWired = false;
  let reactionPickerForCommentId = null;  // shared state: used by toolbar emoji handler too
  let replyToolbarActiveQuill = null;     // shared state: which reply Quill the popups should act on

  function initQuill() {
    if (quillEditor) return;
    const container = document.getElementById('modal-comment-quill');
    if (!container || typeof Quill === 'undefined') return;

    try {
      quillEditor = new Quill(container, {
        theme: 'snow',
        placeholder: 'Write a comment...',
        modules: { toolbar: false },
      });
    } catch (err) {
      console.error('[TaskModal] Quill init failed:', err);
      return;
    }

    if (modalCommentSubmit) modalCommentSubmit.style.display = 'none';

    const toolbarEl  = document.getElementById('pawtry-quill-toolbar');
    const editorRoot = quillEditor.root;

    // Create Save / Cancel action buttons for main editor
    let actionBar = document.getElementById('pawtry-main-comment-actions');
    if (!actionBar) {
      actionBar = document.createElement('div');
      actionBar.id = 'pawtry-main-comment-actions';
      actionBar.className = 'pawtry-main-comment-actions';
      actionBar.style.display = 'none';
      actionBar.innerHTML = `
        <button type="button" class="pawtry-comment-edit-save" data-main-save>บันทึก</button>
        <button type="button" class="pawtry-comment-edit-cancel" data-main-cancel>ยกเลิกการเปลี่ยนแปลง</button>
      `;
      // put after quill container
      const quillWrapper = container.closest('.pawtry-quill-wrapper') || container.parentElement;
      if (quillWrapper && quillWrapper.parentElement) {
        quillWrapper.parentElement.insertBefore(actionBar, quillWrapper.nextSibling);
        console.log('[MainEditor] actionBar INSERTED into DOM');
      } else {
        console.warn('[MainEditor] could not find quillWrapper parent for actionBar');
      }
    }

    function collapse() {
      if (toolbarEl) toolbarEl.classList.remove('is-visible');
      if (editorRoot) editorRoot.style.minHeight = '38px';
      if (actionBar) {
        actionBar.style.display = 'none';
        console.log('[MainEditor] collapse() — actionBar hidden');
      }
    }
    function expand() {
      if (toolbarEl) toolbarEl.classList.add('is-visible');
      if (editorRoot) editorRoot.style.minHeight = '100px';
      if (actionBar) {
        actionBar.style.display = 'flex';
        console.log('[MainEditor] expand() — actionBar SHOWN, parent:', actionBar.parentElement?.tagName);
      } else {
        console.warn('[MainEditor] expand() called but no actionBar!');
      }
    }
    collapse();

    if (editorRoot) {
      editorRoot.addEventListener('focus', expand);
      editorRoot.addEventListener('click', expand);
    }

    // Save on "บันทึก" button click
    async function saveAndCollapse() {
      if (!quillEditor) return;
      const text = quillEditor.getText().trim();
      if (!text) { quillEditor.focus(); return; }
      if (!activeTaskId) return;
      try {
        if (window._pawtrySubmitComment) await window._pawtrySubmitComment();
        collapse();
      } catch (err) { console.error('[save comment]', err); }
    }

    // Cancel: clear content and collapse
    function cancelAndCollapse() {
      if (quillEditor) {
        quillEditor.setText('');
      }
      collapse();
    }

    if (actionBar) {
      actionBar.addEventListener('click', (e) => {
        if (e.target.closest('[data-main-save]'))   { saveAndCollapse();   return; }
        if (e.target.closest('[data-main-cancel]')) { cancelAndCollapse(); return; }
      });
    }

    // Active button highlighting
    quillEditor.on('selection-change', updateToolbarActive);
    quillEditor.on('text-change', updateToolbarActive);

    window._pawtryCollapseQuill = collapse;
    window._pawtryExpandQuill = expand;

    if (!customToolbarWired) {
      customToolbarWired = true;
      setupCustomToolbar();
    }

    // Enable @mention on main comment editor
    if (typeof attachMentionSupport === 'function') {
      attachMentionSupport(quillEditor);
    }
  }

  function updateToolbarActive() {
    if (!quillEditor) return;
    const range = quillEditor.getSelection();
    if (!range) return;
    const fmt = quillEditor.getFormat(range);
    const setActive = (action, on) => {
      const btn = document.querySelector(`#pawtry-quill-toolbar [data-pawtry-action="${action}"]`);
      if (btn) btn.classList.toggle('is-active', !!on);
    };
    setActive('bold', fmt.bold);
    setActive('italic', fmt.italic);
  }

  function setupCustomToolbar() {
    const insertMenu    = document.getElementById('pawtry-insert-menu');
    const insertList    = document.getElementById('pawtry-insert-list');
    const insertSearch  = document.getElementById('pawtry-insert-search-input');
    const moreMenu      = document.getElementById('pawtry-more-menu');
    const headerMenu    = document.getElementById('pawtry-header-menu');
    const listMenu      = document.getElementById('pawtry-list-menu');
    const emojiPopup    = document.getElementById('pawtry-emoji-popup');
    const linkDialog    = document.getElementById('pawtry-link-dialog');
    const linkUrl       = document.getElementById('pawtry-link-url');
    const linkText      = document.getElementById('pawtry-link-text');
    const linkCancel    = document.getElementById('pawtry-link-cancel');
    const linkInsert    = document.getElementById('pawtry-link-insert');
    const attachInput   = document.getElementById('pawtry-attach-input');

    const allPopups = [insertMenu, moreMenu, headerMenu, listMenu, emojiPopup, linkDialog];

    function closeAllToolbarPopups() {
      allPopups.forEach(p => p && p.classList.remove('is-open'));
    }

    function positionPopup(popup, anchorBtn) {
      const rect = anchorBtn.getBoundingClientRect();
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.left = `${rect.left}px`;
      const popupRect = popup.getBoundingClientRect();
      const vw = window.innerWidth;
      if (rect.left + (popupRect.width || 300) > vw - 16) {
        popup.style.left = `${Math.max(8, vw - (popupRect.width || 300) - 16)}px`;
      }
    }

    const insertItems = [
      { id: 'link', icon: 'link', title: 'Link', desc: 'Insert a link', shortcut: 'Ctrl+K',
        action: () => openLinkDialog() },
      { id: 'image', icon: 'image', title: 'Image', desc: 'Insert an image by URL',
        action: () => {
          const url = prompt('Paste image URL:');
          if (!url) return;
          if (!/^https?:\/\//i.test(url)) { alert('URL must start with http:// or https://'); return; }
          const q = getActiveQuill();
          if (!q) return;
          const range = q.getSelection(true) || { index: q.getLength() };
          q.insertEmbed(range.index, 'image', url, Quill.sources.USER);
          q.setSelection(range.index + 1, Quill.sources.SILENT);
          replyToolbarActiveQuill = null;
        } },
      { id: 'emoji', icon: 'mood', title: 'Emoji', desc: 'Use emojis to express ideas 🎉',
        action: () => openEmojiPicker() },
      { id: 'code', icon: 'code', title: 'Code snippet', desc: 'Display code with syntax highlighting',
        action: () => { const q = getActiveQuill(); if (q) q.format('code-block', true); replyToolbarActiveQuill = null; } },
      { id: 'quote', icon: 'format_quote', title: 'Quote', desc: 'Capture a quote',
        action: () => { const q = getActiveQuill(); if (q) q.format('blockquote', true); replyToolbarActiveQuill = null; } },
    ];

    function renderInsertList(filter = '') {
      const f = filter.toLowerCase();
      const filtered = insertItems.filter(i => i.title.toLowerCase().includes(f) || i.desc.toLowerCase().includes(f));
      insertList.innerHTML = filtered.map((item, idx) => `
        <div class="pawtry-insert-item ${idx === 0 ? 'is-focused' : ''}" data-item-id="${item.id}">
          <div class="pawtry-insert-item__icon"><span class="material-symbols-outlined">${item.icon}</span></div>
          <div class="pawtry-insert-item__body">
            <div class="pawtry-insert-item__title">${escapeHtml(item.title)}</div>
            <div class="pawtry-insert-item__desc">${escapeHtml(item.desc)}</div>
          </div>
          ${item.shortcut ? `<span class="pawtry-insert-item__shortcut">${item.shortcut}</span>` : ''}
        </div>
      `).join('');
    }

    insertList.addEventListener('click', (e) => {
      const el = e.target.closest('[data-item-id]');
      if (!el) return;
      const item = insertItems.find(i => i.id === el.dataset.itemId);
      if (item) {
        closeAllToolbarPopups();
        setTimeout(() => item.action(), 30);
      }
    });

    insertSearch.addEventListener('input', () => renderInsertList(insertSearch.value));
    insertSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const focused = insertList.querySelector('.pawtry-insert-item.is-focused');
        if (focused) focused.click();
      } else if (e.key === 'Escape') {
        closeAllToolbarPopups();
      }
    });

    function openInsertMenu(btn) {
      closeAllToolbarPopups();
      renderInsertList('');
      insertSearch.value = '';
      insertMenu.classList.add('is-open');
      positionPopup(insertMenu, btn);
      setTimeout(() => insertSearch.focus(), 30);
    }
    function openHeaderMenu(btn) {
      closeAllToolbarPopups();
      headerMenu.classList.add('is-open');
      positionPopup(headerMenu, btn);
    }
    function openListMenu(btn) {
      closeAllToolbarPopups();
      listMenu.classList.add('is-open');
      positionPopup(listMenu, btn);
    }
    function openMoreMenu(btn) {
      closeAllToolbarPopups();
      moreMenu.classList.add('is-open');
      positionPopup(moreMenu, btn);
    }
    function openEmojiPicker() {
      closeAllToolbarPopups();
      const anchor = document.querySelector('#pawtry-quill-toolbar [data-pawtry-action="insert"]');
      emojiPopup.classList.add('is-open');
      if (anchor) positionPopup(emojiPopup, anchor);
    }
    function openLinkDialog() {
      closeAllToolbarPopups();
      const sel = quillEditor.getSelection(true);
      const selectedText = sel && sel.length > 0 ? quillEditor.getText(sel.index, sel.length) : '';
      linkUrl.value = '';
      linkText.value = selectedText;
      const anchor = document.querySelector('#pawtry-quill-toolbar [data-pawtry-action="insert"]');
      linkDialog.classList.add('is-open');
      if (anchor) positionPopup(linkDialog, anchor);
      setTimeout(() => linkUrl.focus(), 30);
    }

    document.querySelectorAll('#pawtry-quill-toolbar [data-pawtry-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!quillEditor) return;
        const action = btn.dataset.pawtryAction;
        quillEditor.focus();
        if (action === 'header-menu') { openHeaderMenu(btn); return; }
        if (action === 'list-menu')   { openListMenu(btn);   return; }
        if (action === 'more')        { openMoreMenu(btn);   return; }
        if (action === 'insert')      { openInsertMenu(btn); return; }
        if (action === 'attach')      { attachInput.click(); return; }
        if (['bold', 'italic'].includes(action)) {
          const range = quillEditor.getSelection();
          if (range) {
            const cur = quillEditor.getFormat(range);
            quillEditor.format(action, !cur[action]);
            updateToolbarActive();
          }
        }
      });
    });

    // Helper: determine which Quill the popup should act on
    function getActiveQuill() {
      return replyToolbarActiveQuill || quillEditor;
    }

    headerMenu.addEventListener('click', (e) => {
      const el = e.target.closest('[data-header-level]');
      if (!el) return;
      const level = parseInt(el.dataset.headerLevel, 10);
      const q = getActiveQuill();
      if (q) q.format('header', level || false);
      replyToolbarActiveQuill = null;
      closeAllToolbarPopups();
    });

    listMenu.addEventListener('click', (e) => {
      const el = e.target.closest('[data-list-type]');
      if (!el) return;
      const q = getActiveQuill();
      if (q) q.format('list', el.dataset.listType);
      replyToolbarActiveQuill = null;
      closeAllToolbarPopups();
    });

    moreMenu.addEventListener('click', (e) => {
      const el = e.target.closest('[data-more-action]');
      if (!el) return;
      const action = el.dataset.moreAction;
      const q = getActiveQuill();
      if (!q) return;
      const range = q.getSelection();
      if (action === 'clean') {
        if (range) q.removeFormat(range.index, range.length || 0);
      } else if (action === 'blockquote') {
        q.format('blockquote', true);
      } else if (range) {
        const cur = q.getFormat(range);
        q.format(action, !cur[action]);
      }
      replyToolbarActiveQuill = null;
      closeAllToolbarPopups();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('.pawtry-popup')) return;
      if (e.target.closest('#pawtry-quill-toolbar')) return;
      if (e.target.closest('.pawtry-reply-toolbar')) return;  // ← อย่าปิดเมื่อคลิก reply toolbar
      if (e.target.closest('.pawtry-desc-toolbar')) return;   // ← อย่าปิดเมื่อคลิก description toolbar
      if (e.target.closest('[data-reaction-picker]')) return;  // ← อย่าปิดเมื่อคลิกปุ่ม reaction picker
      replyToolbarActiveQuill = null;
      closeAllToolbarPopups();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllToolbarPopups();
    });

    const emojiEl = emojiPopup.querySelector('emoji-picker');
    if (emojiEl) {
      emojiEl.addEventListener('emoji-click', (ev) => {
        // ถ้ากำลังอยู่ใน reaction picker context → ปล่อยให้ reaction handler ทำงาน
        if (reactionPickerForCommentId) return;
        const emoji = ev.detail.unicode;
        const q = getActiveQuill();
        if (!q) return;
        const range = q.getSelection(true) || { index: q.getLength() };
        q.insertText(range.index, emoji, Quill.sources.USER);
        q.setSelection(range.index + emoji.length, Quill.sources.SILENT);
        replyToolbarActiveQuill = null;
        closeAllToolbarPopups();
      });
    }

    linkCancel.addEventListener('click', () => closeAllToolbarPopups());
    linkInsert.addEventListener('click', () => {
      const url = linkUrl.value.trim();
      if (!url) { linkUrl.focus(); return; }
      const text = linkText.value.trim() || url;
      const q = getActiveQuill();
      if (!q) return;
      const range = q.getSelection(true) || { index: q.getLength(), length: 0 };
      if (range.length > 0) q.deleteText(range.index, range.length);
      q.insertText(range.index, text, 'link', url, Quill.sources.USER);
      q.setSelection(range.index + text.length, Quill.sources.SILENT);
      replyToolbarActiveQuill = null;
      closeAllToolbarPopups();
    });
    linkUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') linkInsert.click(); });

    attachInput.addEventListener('change', async () => {
      const file = attachInput.files && attachInput.files[0];
      attachInput.value = '';
      if (!file || !activeTaskId) return;
      try {
        const data = await uploadTaskAttachment(activeTaskId, file);
        const attachment = data && data.attachment;
        if (attachment) {
          const cached = taskCache.get(activeTaskId);
          const list = (cached && Array.isArray(cached.attachments)) ? cached.attachments.slice() : [];
          list.unshift(attachment);
          if (cached) cached.attachments = list;
          if (window.Dashboard.renderAttachments) window.Dashboard.renderAttachments(list);
          if (attachment.mimetype && attachment.mimetype.startsWith('image/')) {
            const url = coverSrc(attachment.filename_or_url);
            const q = getActiveQuill();
            if (q) {
              const range = q.getSelection(true) || { index: q.getLength() };
              q.insertEmbed(range.index, 'image', url, Quill.sources.USER);
              q.setSelection(range.index + 1, Quill.sources.SILENT);
            }
            replyToolbarActiveQuill = null;
          }
          if (showToast) showToast('File attached', 'attach_file');
        }
      } catch (err) {
        console.error('attach failed:', err);
        if (showToast) showToast('Upload failed', 'error');
      }
    });
  }

  function getQuillContent() {
    if (!quillEditor) return modalCommentInput ? modalCommentInput.value.trim() : '';
    const text = quillEditor.getText().trim();
    if (!text) return '';
    const html = quillEditor.root.innerHTML;
    if (html === '<p><br></p>' || html === '<p></p>' || html.trim() === '') return '';
    return html;
  }

  function clearQuillContent() {
    if (quillEditor) {
      try {
        quillEditor.setText('\n');
        const editor = quillEditor.root;
        if (editor) {
          editor.innerHTML = '<p><br></p>';
          editor.scrollTop = 0;
          editor.classList.add('ql-blank');
        }
        quillEditor.history.clear();
        quillEditor.blur();
        if (window._pawtryCollapseQuill) window._pawtryCollapseQuill();
      } catch (err) { console.error('[TaskModal] clearQuillContent error:', err); }
    } else if (modalCommentInput) {
      modalCommentInput.value = '';
    }
  }

  setTimeout(initQuill, 300);

  // ─────────────────────────────────────────────
  // Description — Trello-style view / edit mode
  // ─────────────────────────────────────────────
  const modalDescView       = document.getElementById('modal-desc-view');
  const modalDescBody       = document.getElementById('modal-desc-body');
  const modalDescEdit       = document.getElementById('modal-desc-edit');
  const modalDescQuillEl    = document.getElementById('modal-desc-quill');
  const modalDescSaveBtn    = document.getElementById('modal-desc-save-btn');
  const modalDescCancelBtn  = document.getElementById('modal-desc-cancel-btn');
  const modalDescEditBtn    = document.getElementById('modal-desc-edit-btn');
  const modalDescEmptyBtn   = document.getElementById('modal-desc-empty-placeholder');

  let descQuill = null;
  let descOriginalContent = '';    // baseline for change detection

  function initDescQuill() {
    if (descQuill || !modalDescQuillEl || typeof Quill === 'undefined') return;
    try {
      descQuill = new Quill(modalDescQuillEl, {
        theme: 'snow',
        placeholder: 'Add a more detailed description...',
        modules: { toolbar: false },
      });
      if (typeof attachMentionSupport === 'function') attachMentionSupport(descQuill);

      // Wire description toolbar
      wireDescToolbar(descQuill);

      // Highlight active formatting buttons (B, I)
      descQuill.on('selection-change', () => updateDescToolbarActive(descQuill));
      descQuill.on('text-change', () => updateDescToolbarActive(descQuill));
    } catch (err) {
      console.error('desc Quill init failed:', err);
    }
  }
  setTimeout(initDescQuill, 300);

  function updateDescToolbarActive(q) {
    if (!q) return;
    const range = q.getSelection();
    if (!range) return;
    const fmt = q.getFormat(range);
    const setActive = (action, on) => {
      const btn = document.querySelector(`#modal-desc-toolbar [data-desc-action="${action}"]`);
      if (btn) btn.classList.toggle('is-active', !!on);
    };
    setActive('bold', fmt.bold);
    setActive('italic', fmt.italic);
  }

  function wireDescToolbar(q) {
    const tb = document.getElementById('modal-desc-toolbar');
    if (!tb || tb._pawtryWired) return;
    tb._pawtryWired = true;

    const insertMenu = document.getElementById('pawtry-insert-menu');
    const moreMenu   = document.getElementById('pawtry-more-menu');
    const headerMenu = document.getElementById('pawtry-header-menu');
    const listMenu   = document.getElementById('pawtry-list-menu');
    const emojiPopup = document.getElementById('pawtry-emoji-popup');
    const linkDialog = document.getElementById('pawtry-link-dialog');

    function closeAllPopups() {
      [insertMenu, moreMenu, headerMenu, listMenu, emojiPopup, linkDialog]
        .forEach(p => p && p.classList.remove('is-open'));
    }
    function positionPopup(popup, anchor) {
      const rect = anchor.getBoundingClientRect();
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.left = `${rect.left}px`;
      const vw = window.innerWidth;
      const pw = popup.offsetWidth || 300;
      if (rect.left + pw > vw - 16) {
        popup.style.left = `${Math.max(8, vw - pw - 16)}px`;
      }
    }

    tb.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-desc-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.descAction;
      q.focus();

      if (action === 'bold' || action === 'italic') {
        const range = q.getSelection();
        if (range) {
          const cur = q.getFormat(range);
          q.format(action, !cur[action]);
          updateDescToolbarActive(q);
        }
        return;
      }

      // Set replyToolbarActiveQuill to descQuill so shared popups route here
      replyToolbarActiveQuill = q;

      if (action === 'header-menu') {
        closeAllPopups(); headerMenu.classList.add('is-open'); positionPopup(headerMenu, btn);
      } else if (action === 'list-menu') {
        closeAllPopups(); listMenu.classList.add('is-open'); positionPopup(listMenu, btn);
      } else if (action === 'more') {
        closeAllPopups(); moreMenu.classList.add('is-open'); positionPopup(moreMenu, btn);
      } else if (action === 'insert') {
        closeAllPopups();
        const searchInput = document.getElementById('pawtry-insert-search-input');
        const listEl = document.getElementById('pawtry-insert-list');
        if (searchInput) searchInput.value = '';
        if (searchInput) searchInput.dispatchEvent(new Event('input'));
        insertMenu.classList.add('is-open');
        positionPopup(insertMenu, btn);
        if (searchInput) setTimeout(() => searchInput.focus(), 30);
      } else if (action === 'mention') {
        const sel = q.getSelection(true) || { index: q.getLength(), length: 0 };
        q.insertText(sel.index, '@', Quill.sources.USER);
        q.setSelection(sel.index + 1, Quill.sources.SILENT);
      } else if (action === 'attach') {
        // Attach file — trigger same hidden input used by main toolbar
        replyToolbarActiveQuill = q;
        const attachInput = document.getElementById('pawtry-attach-input');
        if (attachInput) attachInput.click();
      } else if (action === 'markdown') {
        // Toggle markdown view
        toggleMarkdownView(q);
      } else if (action === 'help') {
        openEditorHelp();
      }
    });
  }

  // ─────────────────────────────────────────────
  // Description — Markdown view + Help modal
  // ─────────────────────────────────────────────
  function htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;
    // normalize breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');
    // strong / bold
    md = md.replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gis, '**$2**');
    // em / italic
    md = md.replace(/<(em|i)\b[^>]*>(.*?)<\/\1>/gis, '*$2*');
    // links
    md = md.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)');
    // images
    md = md.replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*\/?>/gis, '![]($1)');
    // headings
    md = md.replace(/<h1\b[^>]*>(.*?)<\/h1>/gis, '# $1\n');
    md = md.replace(/<h2\b[^>]*>(.*?)<\/h2>/gis, '## $1\n');
    md = md.replace(/<h3\b[^>]*>(.*?)<\/h3>/gis, '### $1\n');
    // blockquote
    md = md.replace(/<blockquote\b[^>]*>(.*?)<\/blockquote>/gis, '> $1\n');
    // code
    md = md.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');
    md = md.replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`');
    // lists — simple handling
    md = md.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
      inner.replace(/<li\b[^>]*>(.*?)<\/li>/gis, '- $1\n'));
    md = md.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let i = 0;
      return inner.replace(/<li\b[^>]*>(.*?)<\/li>/gis, () => `${++i}. $1\n`)
        .replace(/\$1/g, '');  // safety
    });
    // mention spans — preserve as @name
    md = md.replace(/<span\b[^>]*data-mention[^>]*>@?(.*?)<\/span>/gis, '@$1');
    // paragraphs → double newline
    md = md.replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n');
    md = md.replace(/<p\b[^>]*>/gi, '');
    md = md.replace(/<\/p>/gi, '');
    // strip remaining tags
    md = md.replace(/<[^>]+>/g, '');
    // decode basic HTML entities
    md = md.replace(/&nbsp;/g, ' ')
           .replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"');
    // collapse extra blank lines
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function toggleMarkdownView(q) {
    const mdPre  = document.getElementById('modal-desc-markdown');
    const qEl    = document.getElementById('modal-desc-quill');
    const btn    = document.querySelector('[data-desc-action="markdown"]');
    if (!mdPre || !qEl) return;

    if (mdPre.classList.contains('hidden')) {
      // show markdown
      const html = q.root.innerHTML;
      mdPre.textContent = htmlToMarkdown(html);
      mdPre.classList.remove('hidden');
      qEl.style.display = 'none';
      if (btn) btn.classList.add('is-active');
    } else {
      // back to rich editor
      mdPre.classList.add('hidden');
      qEl.style.display = '';
      if (btn) btn.classList.remove('is-active');
    }
  }

  function openEditorHelp() {
    const help = document.getElementById('pawtry-desc-help');
    if (help) help.classList.remove('hidden');
  }
  function closeEditorHelp() {
    const help = document.getElementById('pawtry-desc-help');
    if (help) help.classList.add('hidden');
  }
  // wire close buttons once
  (function wireHelpModal() {
    const help = document.getElementById('pawtry-desc-help');
    if (!help) return;
    const closeBtn = document.getElementById('pawtry-desc-help-close');
    const backdrop = help.querySelector('.pawtry-desc-help-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeEditorHelp);
    if (backdrop) backdrop.addEventListener('click', closeEditorHelp);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !help.classList.contains('hidden')) closeEditorHelp();
    });
  })();

  function descToHtml(text) {
    if (!text) return '';
    const t = String(text);
    // If looks like HTML (has tags), use as-is; otherwise wrap each line in <p>
    if (/<\w+[^>]*>/.test(t)) return t;
    return t.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('');
  }

  function descPlainFromHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function setDescriptionView(text) {
    const html = descToHtml(text);
    if (modalDesc) modalDesc.value = descPlainFromHtml(html);  // keep legacy textarea in sync
    if (modalDescBody) modalDescBody.innerHTML = html;

    const hasContent = !!(text && String(text).trim());
    if (modalDescEmptyBtn) modalDescEmptyBtn.classList.toggle('hidden', hasContent);
    if (modalDescBody) modalDescBody.classList.toggle('hidden', !hasContent);
    if (modalDescEditBtn) modalDescEditBtn.classList.toggle('hidden', !hasContent);
  }

  function enterDescEditMode() {
    if (!modalDescEdit || !modalDescView) return;
    initDescQuill();
    if (!descQuill) return;
    // load current content into Quill
    const currentHtml = modalDescBody ? modalDescBody.innerHTML : '';
    descOriginalContent = currentHtml;
    try {
      if (currentHtml.trim()) {
        descQuill.root.innerHTML = currentHtml;
      } else {
        descQuill.setText('');
      }
    } catch (e) { console.warn(e); }

    modalDescView.classList.add('hidden');
    if (modalDescEditBtn) modalDescEditBtn.classList.add('hidden');
    modalDescEdit.classList.remove('hidden');
    setTimeout(() => descQuill && descQuill.focus(), 50);
  }

  function exitDescEditMode() {
    if (!modalDescEdit || !modalDescView) return;
    modalDescEdit.classList.add('hidden');
    modalDescView.classList.remove('hidden');
    // Re-sync view from cache
    const cached = activeTaskId && taskCache.get(activeTaskId);
    if (cached) setDescriptionView(cached.description || '');
  }

  async function saveDescription() {
    if (!descQuill) return;
    let html = descQuill.root.innerHTML;
    if (html === '<p><br></p>') html = '';  // treat as empty

    // if unchanged, just exit
    if (html === descOriginalContent) {
      exitDescEditMode();
      return;
    }

    if (!activeTaskId) {
      // create-mode — just stash into the legacy textarea; the main "Save Changes" will POST it
      if (modalDesc) modalDesc.value = descPlainFromHtml(html);
      setDescriptionView(html);
      exitDescEditMode();
      return;
    }

    try {
      await api(`/tasks/${activeTaskId}`, { method: 'PUT', body: { description: html } });
      const cached = taskCache.get(activeTaskId);
      if (cached) cached.description = html;
      if (modalDesc) modalDesc.value = descPlainFromHtml(html);
      setDescriptionView(html);
      exitDescEditMode();
      if (showToast) showToast('Description updated', 'check');
    } catch (err) {
      console.error('save description failed:', err);
      if (showToast) showToast('Could not save description', 'error');
    }
  }

  function cancelDescEdit() {
    // just exit without saving
    exitDescEditMode();
  }

  if (modalDescEditBtn) modalDescEditBtn.addEventListener('click', enterDescEditMode);
  if (modalDescEmptyBtn) modalDescEmptyBtn.addEventListener('click', enterDescEditMode);
  if (modalDescBody) modalDescBody.addEventListener('click', (e) => {
    // don't hijack link clicks
    if (e.target.closest('a, img')) return;
    enterDescEditMode();
  });
  if (modalDescSaveBtn) modalDescSaveBtn.addEventListener('click', saveDescription);
  if (modalDescCancelBtn) modalDescCancelBtn.addEventListener('click', cancelDescEdit);

  // expose for other parts of the module
  window._pawtrySetDescView    = setDescriptionView;
  window._pawtryExitDescEdit   = exitDescEditMode;
  window._pawtryIsDescEditing  = () => modalDescEdit && !modalDescEdit.classList.contains('hidden');
  window._pawtrySaveDescIfOpen = saveDescription;

  // ─────────────────────────────────────────────
  // Popup helpers
  // ─────────────────────────────────────────────
  function closeAllPopups() {
    modalPanel.querySelectorAll('.mini-popup').forEach(p => p.classList.add('hidden'));
    if (popupLabelsCreate && !popupLabelsCreate.classList.contains('hidden')) {
      popupLabelsCreate.classList.add('hidden');
      if (modalCreateLabelBtn) modalCreateLabelBtn.classList.remove('hidden');
    }
  }

  modalPanel.querySelectorAll('.sidebar-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popupId = btn.dataset.popup;
      const popup   = document.getElementById(popupId);
      if (!popup) return;
      const wasOpen = !popup.classList.contains('hidden');
      closeAllPopups();
      if (!wasOpen) popup.classList.remove('hidden');
    });
  });

  modalPanel.querySelectorAll('.mini-popup-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = btn.closest('.mini-popup');
      if (popup) popup.classList.add('hidden');
    });
  });

  modalPanel.addEventListener('click', (e) => {
    if (e.target.closest('.mini-popup') || e.target.closest('.sidebar-action-btn')) return;
    closeAllPopups();
  });

  function renderLabelsPopup(task) {
    const boardLabelsCache = getLabels();
    const selected = new Set((task.labels || []).map(l => String(l.id)));
    if (!boardLabelsCache.length) {
      popupLabelsList.innerHTML = '<li class="italic text-xs text-gray-400 px-1 py-2">No labels yet — create one below.</li>';
      return;
    }
    popupLabelsList.innerHTML = boardLabelsCache.map(l => {
      const isOn = selected.has(String(l.id));
      const title = l.title ? escapeHtml(l.title) : '';
      return `<li><button type="button" data-label-id="${escapeHtml(String(l.id))}" class="group relative w-full h-8 rounded-md flex items-center justify-between px-2 text-[11px] font-bold text-white uppercase tracking-wide hover:opacity-90 transition-opacity" style="background:${escapeHtml(l.color || '#6b7280')}"><span class="truncate">${title}</span><span class="material-symbols-outlined text-sm ${isOn ? '' : 'invisible'}">check</span></button></li>`;
    }).join('');
  }

  function renderMembersPopup(task) {
    const boardMembersCache = getMembers();
    const selected = new Set((task.assignees || []).map(u => String(u.id)));
    if (!boardMembersCache.length) {
      popupMembersList.innerHTML = '<li class="italic text-xs text-gray-400 px-1 py-2">No members in this board yet.</li>';
      return;
    }
    popupMembersList.innerHTML = boardMembersCache.map(u => {
      const isOn = selected.has(String(u.id));
      const label = escapeHtml(u.full_name || u.email || 'Unknown');
      return `<li><button type="button" data-user-id="${escapeHtml(String(u.id))}" class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-left"><span class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style="background:${colorFor(u.email || u.id || u.full_name)}">${escapeHtml(initials(u.full_name || u.email))}</span><span class="flex-1 min-w-0 text-xs text-gray-700 truncate">${label}</span>${isOn ? '<span class="material-symbols-outlined text-sm text-indigo-600">check</span>' : ''}</button></li>`;
    }).join('');
  }

  function paintDueComplete(isComplete) {
    if (modalCompleteBadge) modalCompleteBadge.classList.toggle('hidden', !isComplete);
    if (modalDue) {
      modalDue.classList.toggle('bg-green-500/15', isComplete);
      modalDue.classList.toggle('bg-gray-100', !isComplete);
    }
    if (modalDueText) {
      modalDueText.classList.toggle('line-through', isComplete);
      modalDueText.classList.toggle('text-green-700', isComplete);
    }
  }

  // ─────────────────────────────────────────────
  // Checkbox, Due date
  // ─────────────────────────────────────────────
  if (modalCompleteCheckbox) {
    modalCompleteCheckbox.addEventListener('change', async () => {
      if (!activeTaskId) return;
      const next = modalCompleteCheckbox.checked;
      paintDueComplete(next);
      const cached = taskCache.get(activeTaskId);
      if (cached) cached.is_completed = next;
      try {
        await api(`/tasks/${activeTaskId}/complete`, { method: 'PUT', body: { is_completed: next } });
      } catch (err) {
        console.error('toggle complete failed:', err);
        alert('Could not update status: ' + (err.message || 'Unknown error'));
        modalCompleteCheckbox.checked = !next;
        paintDueComplete(!next);
        if (cached) cached.is_completed = !next;
      }
    });
  }

  if (modalDueSaveBtn) {
    modalDueSaveBtn.addEventListener('click', async () => {
      if (!activeTaskId) return;
      const raw = modalDueInput.value;
      if (!raw) { alert('Please pick a date first.'); return; }
      const dateOnly = raw.slice(0, 10);
      modalDueSaveBtn.disabled = true;
      try {
        const data = await api(`/tasks/${activeTaskId}/due_date`, { method: 'PUT', body: { due_date: dateOnly } });
        const updated = data.task;
        const cached  = taskCache.get(activeTaskId);
        if (cached) cached.due_date = updated.due_date;
        modalDueText.textContent = formatDueDate(updated.due_date) || 'No due date set';
        modalDueSection.classList.remove('hidden');
        closeAllPopups();
      } catch (err) {
        console.error('set due_date failed:', err);
        alert('Could not update due date: ' + (err.message || 'Unknown error'));
      } finally {
        modalDueSaveBtn.disabled = false;
      }
    });
  }

  if (modalDueClearBtn) {
    modalDueClearBtn.addEventListener('click', async () => {
      if (!activeTaskId) return;
      modalDueClearBtn.disabled = true;
      try {
        await api(`/tasks/${activeTaskId}/due_date`, { method: 'PUT', body: { due_date: null } });
        const cached = taskCache.get(activeTaskId);
        if (cached) cached.due_date = null;
        modalDueInput.value = '';
        modalDueSection.classList.add('hidden');
        closeAllPopups();
      } catch (err) {
        console.error('clear due_date failed:', err);
        alert('Could not clear due date: ' + (err.message || 'Unknown error'));
      } finally {
        modalDueClearBtn.disabled = false;
      }
    });
  }

  // ─────────────────────────────────────────────
  // Submit comment (autosave entry point)
  // ─────────────────────────────────────────────
  async function submitCommentFn() {
    if (!activeTaskId) return;
    const content = getQuillContent();
    if (!content || content === '<p><br></p>') return;
    let posted = false;
    try {
      const data = await api(`/tasks/${activeTaskId}/comments`, { method: 'POST', body: { content } });
      const comment = data.comment;
      posted = true;

      const empty = modalCommentsList.querySelector('li.italic');
      if (empty) empty.remove();

      // ใช้ renderCommentItem เพื่อให้มีปุ่ม edit/delete (ถ้าเป็นคอมเม้นตัวเอง)
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCommentItem(comment);
      const li = wrapper.firstElementChild;
      if (li) modalCommentsList.appendChild(li);

      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.comments = Array.isArray(cached.comments) ? cached.comments : [];
        cached.comments.push(comment);
      }
      if (showToast) showToast('Comment saved', 'check');
    } catch (err) {
      console.error('add comment failed:', err);
      if (showToast) showToast('Could not save comment', 'error');
    } finally {
      if (posted) clearQuillContent();
    }
  }

  window._pawtrySubmitComment = submitCommentFn;

  if (modalCommentSubmit) {
    modalCommentSubmit.addEventListener('click', submitCommentFn);
  }

  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // Autosave helpers for edit mode and reply forms
  // ─────────────────────────────────────────────
  async function autosaveOpenEdits(clickTarget) {
    // Find all open edit containers
    const editors = modalCommentsList.querySelectorAll('[data-comment-editor]');
    for (const ed of editors) {
      // Skip if click is inside THIS editor (don't autosave if clicking within same one)
      if (clickTarget && ed.contains(clickTarget)) continue;
      const commentId = ed.dataset.commentEditor;
      const ta = ed.querySelector('textarea');
      if (!ta) continue;
      const newText = ta.value.trim();
      const origText = (ed.dataset.originalText || '').trim();

      // Only save if changed and not empty
      if (!newText) {
        // empty → just exit edit mode (don't save empty)
        exitEditMode(commentId);
        continue;
      }
      if (newText === origText) {
        // no change → just exit
        exitEditMode(commentId);
        continue;
      }
      // Changed → save
      console.log('[autosave-edit] saving comment', commentId);
      try {
        await saveEditedComment(commentId);
      } catch (err) {
        console.error('[autosave-edit] failed:', err);
      }
    }
  }

  async function autosaveOpenReplies(clickTarget) {
    const forms = modalCommentsList.querySelectorAll('.pawtry-reply-form');
    for (const form of forms) {
      if (clickTarget && form.contains(clickTarget)) continue;
      const commentId = form.dataset.replyForm;
      const content = getReplyContent(commentId);
      if (!content) {
        // empty → close silently
        hideReplyForm(commentId);
        continue;
      }
      console.log('[autosave-reply] sending reply for', commentId);
      try {
        await submitReply(commentId);
      } catch (err) {
        console.error('[autosave-reply] failed:', err);
      }
    }
  }

  // Global autosave — click anywhere outside the comment editor saves it
  // ─────────────────────────────────────────────
  (function wireGlobalAutosave() {
    // Use mousedown + a small delay to avoid racing with editor focus
    document.addEventListener('mousedown', (e) => {
      // Skip if no active task
      if (!activeTaskId) return;

      const target = e.target;

      // ── 1. Main comment editor autosave ──
      const skipMain = (
        target.closest('#modal-comment-quill') ||
        target.closest('#pawtry-quill-toolbar') ||
        target.closest('.pawtry-quill-wrapper') ||
        target.closest('#pawtry-main-comment-actions') ||
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu') ||
        target.closest('.pawtry-reply-form') ||
        target.closest('.pawtry-reply-toolbar') ||
        target.closest('.pawtry-desc-toolbar') ||       // ← ไม่ trigger main autosave เมื่อคลิก desc toolbar
        target.closest('#modal-desc-edit') ||           // ← ไม่ trigger main autosave เมื่อคลิกใน desc editor
        target.closest('[data-comment-editor]') ||      // inside any edit form
        target.closest('[data-edit-save]') ||
        target.closest('[data-edit-cancel]')
      );

      if (quillEditor && !skipMain) {
        const content = getQuillContent();
        if (content && content !== '<p><br></p>') {
          console.log('[autosave-main] SAVING...');
          submitCommentFn()
            .then(() => console.log('[autosave-main] SAVED ✓'))
            .catch(err => console.error('[autosave-main] failed:', err));
        }
      }

      // ── 2. Edit mode autosave (for any open edit forms) ──
      // Skip if the click is a popup or internal UI that shouldn't trigger save
      const skipEditTriggers = (
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu') ||
        target.closest('[data-edit-save]') ||          // save button has its own handler
        target.closest('[data-edit-cancel]')           // cancel button has its own handler
      );
      if (!skipEditTriggers) {
        autosaveOpenEdits(target);
      }

      // ── 3. Reply form autosave ──
      const skipReplyTriggers = (
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu') ||
        target.closest('[data-reply-send]') ||         // send button has its own handler
        target.closest('[data-reply-cancel]')          // cancel button has its own handler
      );
      if (!skipReplyTriggers) {
        autosaveOpenReplies(target);
      }

      // ── 4. Description edit mode autosave ──
      const skipDescTriggers = (
        target.closest('#modal-desc-edit') ||          // inside description editor
        target.closest('#modal-desc-edit-btn') ||      // Edit button
        target.closest('#modal-desc-save-btn') ||      // Save button
        target.closest('#modal-desc-cancel-btn') ||    // Cancel button
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu')
      );
      if (!skipDescTriggers && window._pawtryIsDescEditing && window._pawtryIsDescEditing()) {
        console.log('[autosave-desc] checking for description changes');
        if (window._pawtrySaveDescIfOpen) {
          window._pawtrySaveDescIfOpen().catch(err => console.error('[autosave-desc] failed:', err));
        }
      }
    }, true);  // capture phase so we save before other handlers run
  })();

  // ─────────────────────────────────────────────
  // Labels & Members (attach / detach)
  // ─────────────────────────────────────────────
  popupLabelsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-label-id]');
    if (!btn || !activeTaskId) return;
    const labelId = btn.dataset.labelId;
    const label   = getLabels().find(l => String(l.id) === String(labelId));
    if (!label) return;
    btn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/labels`, { method: 'POST', body: { label_id: labelId } });
      const attached = !!data.attached;
      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.labels = Array.isArray(cached.labels) ? cached.labels : [];
        if (attached) {
          if (!cached.labels.some(l => String(l.id) === String(labelId))) cached.labels.push(label);
        } else {
          cached.labels = cached.labels.filter(l => String(l.id) !== String(labelId));
        }
        renderLabelsPopup(cached);
        refreshLabelsDisplay(cached);
      }
    } catch (err) {
      console.error('toggle label failed:', err);
      alert('Could not toggle label: ' + (err.message || 'Unknown error'));
    } finally { btn.disabled = false; }
  });

  popupMembersList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-user-id]');
    if (!btn || !activeTaskId) return;
    const userId = btn.dataset.userId;
    const user   = getMembers().find(u => String(u.id) === String(userId));
    if (!user) return;
    btn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/assign`, { method: 'POST', body: { user_id: userId } });
      const assigned = !!data.assigned;
      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.assignees = Array.isArray(cached.assignees) ? cached.assignees : [];
        if (assigned) {
          if (!cached.assignees.some(u => String(u.id) === String(userId))) cached.assignees.push(user);
        } else {
          cached.assignees = cached.assignees.filter(u => String(u.id) !== String(userId));
        }
        renderMembersPopup(cached);
        refreshAssigneesDisplay(cached);
      }
    } catch (err) {
      console.error('toggle assignee failed:', err);
      alert('Could not update members: ' + (err.message || 'Unknown error'));
    } finally { btn.disabled = false; }
  });

  // ─────────────────────────────────────────────
  // Create label
  // ─────────────────────────────────────────────
  function resetCreateLabelForm() {
    if (popupLabelsCreateTitle) popupLabelsCreateTitle.value = '';
    if (popupLabelsCreateColorPicker) popupLabelsCreateColorPicker.value = '#3525cd';
  }
  function showCreateLabelForm() {
    resetCreateLabelForm();
    popupLabelsCreate.classList.remove('hidden');
    modalCreateLabelBtn.classList.add('hidden');
    popupLabelsCreateTitle.focus();
  }
  function hideCreateLabelForm() {
    popupLabelsCreate.classList.add('hidden');
    modalCreateLabelBtn.classList.remove('hidden');
  }

  if (modalCreateLabelBtn) modalCreateLabelBtn.addEventListener('click', showCreateLabelForm);
  if (popupLabelsCreateCancel) popupLabelsCreateCancel.addEventListener('click', hideCreateLabelForm);

  if (popupLabelsCreateSubmit) {
    popupLabelsCreateSubmit.addEventListener('click', async () => {
      const activeBoardId = D.getActiveBoardId();
      if (!activeBoardId) return;
      const color = (popupLabelsCreateColorPicker && popupLabelsCreateColorPicker.value) || '#3525cd';
      const title = popupLabelsCreateTitle.value.trim();
      popupLabelsCreateSubmit.disabled = true;
      try {
        const data = await api(`/boards/${activeBoardId}/labels`, { method: 'POST', body: { title: title || null, color } });
        getLabels().push(data.label);
        const cached = activeTaskId ? taskCache.get(activeTaskId) : null;
        renderLabelsPopup(cached || { labels: [] });
        hideCreateLabelForm();
      } catch (err) {
        console.error('create label failed:', err);
        alert('Could not create label: ' + (err.message || 'Unknown error'));
      } finally { popupLabelsCreateSubmit.disabled = false; }
    });
  }

  // ─────────────────────────────────────────────
  // Label context menu (edit / delete)
  // ─────────────────────────────────────────────
  function closeLabelContextMenu() {
    if (!labelCtxMenuEl) return;
    labelCtxMenuEl.classList.add('hidden');
    ctxMenuLabelId = null;
  }
  function openLabelContextMenu(x, y, labelId) {
    if (!labelCtxMenuEl || !labelId) return;
    ctxMenuLabelId = labelId;
    labelCtxMenuEl.style.left = '0px';
    labelCtxMenuEl.style.top  = '0px';
    labelCtxMenuEl.classList.remove('hidden');
    const rect = labelCtxMenuEl.getBoundingClientRect();
    labelCtxMenuEl.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
    labelCtxMenuEl.style.top  = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  }

  popupLabelsList.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('button[data-label-id]');
    if (!btn) return;
    e.preventDefault();
    openLabelContextMenu(e.pageX, e.pageY, btn.dataset.labelId);
  });

  if (ctxEditLabelEl) {
    ctxEditLabelEl.addEventListener('click', async () => {
      const labelId = ctxMenuLabelId;
      closeLabelContextMenu();
      if (!labelId) return;
      const activeBoardId = D.getActiveBoardId();
      if (!activeBoardId) return;
      const label = getLabels().find(l => String(l.id) === String(labelId));
      if (!label) return;
      const newTitle = prompt('Edit label title (leave blank for none):', label.title || '');
      if (newTitle === null) return;
      const newColor = prompt('Edit label color (hex, e.g. #3525cd):', label.color || '#3525cd');
      if (newColor === null) return;
      const trimmedColor = newColor.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(trimmedColor)) { alert('Color must be a hex value like #3525cd'); return; }
      try {
        const data = await api(`/boards/${activeBoardId}/labels/${labelId}`, { method: 'PUT', body: { title: newTitle.trim() || null, color: trimmedColor } });
        const updated = data && data.label;
        if (updated) { label.title = updated.title; label.color = updated.color; }
        taskCache.forEach(t => {
          if (!Array.isArray(t.labels)) return;
          t.labels.forEach(l => { if (String(l.id) === String(labelId)) { l.title = label.title; l.color = label.color; } });
        });
        const cached = activeTaskId ? taskCache.get(activeTaskId) : null;
        renderLabelsPopup(cached || { labels: [] });
        if (cached) refreshLabelsDisplay(cached);
      } catch (err) { console.error('update label failed:', err); alert('Could not update label: ' + (err.message || 'Unknown error')); }
    });
  }

  if (ctxDeleteLabelEl) {
    ctxDeleteLabelEl.addEventListener('click', async () => {
      const labelId = ctxMenuLabelId;
      closeLabelContextMenu();
      if (!labelId) return;
      const activeBoardId = D.getActiveBoardId();
      if (!activeBoardId) return;
      const label = getLabels().find(l => String(l.id) === String(labelId));
      const shownName = (label && (label.title || label.color)) || 'this label';
      if (!confirm(`Delete label "${shownName}"?\n\nIt will be removed from every card that uses it.`)) return;
      try {
        await api(`/boards/${activeBoardId}/labels/${labelId}`, { method: 'DELETE' });
        const labels = getLabels();
        const idx = labels.findIndex(l => String(l.id) === String(labelId));
        if (idx !== -1) labels.splice(idx, 1);
        taskCache.forEach(t => { if (!Array.isArray(t.labels)) return; t.labels = t.labels.filter(l => String(l.id) !== String(labelId)); });
        const cached = activeTaskId ? taskCache.get(activeTaskId) : null;
        renderLabelsPopup(cached || { labels: [] });
        if (cached) refreshLabelsDisplay(cached);
      } catch (err) { console.error('delete label failed:', err); alert('Could not delete label: ' + (err.message || 'Unknown error')); }
    });
  }

  document.addEventListener('click', (e) => {
    if (!labelCtxMenuEl || labelCtxMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('#label-context-menu')) return;
    closeLabelContextMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!labelCtxMenuEl || labelCtxMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('#popup-labels-list button[data-label-id]')) return;
    closeLabelContextMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLabelContextMenu(); });
  window.addEventListener('resize', closeLabelContextMenu);
  window.addEventListener('scroll', closeLabelContextMenu, true);

  // ─────────────────────────────────────────────
  // Display refreshers
  // ─────────────────────────────────────────────
  function refreshLabelsDisplay(task) {
    const labels = Array.isArray(task.labels) ? task.labels : [];
    if (labels.length) {
      modalLabelsDisplay.innerHTML = labels.map(l => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-white uppercase tracking-wide" style="background:${escapeHtml(l.color || '#6b7280')}">${escapeHtml(l.title || '')}</span>`).join('');
      modalLabelsSection.classList.remove('hidden');
    } else {
      modalLabelsDisplay.innerHTML = '';
      modalLabelsSection.classList.add('hidden');
    }
  }

  function refreshAssigneesDisplay(task) {
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    modalAssignees.innerHTML = assignees.length
      ? assignees.map(u => {
          const pic = u.profile_picture || u.avatar_url;
          const avatar = pic
            ? `<img src="${escapeHtml(coverSrc(pic))}" alt="${escapeHtml(u.full_name || u.email || '')}" class="w-6 h-6 rounded-full object-cover"/>`
            : `<span class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style="background:${colorFor(u.email || u.id || u.full_name)}">${escapeHtml(initials(u.full_name))}</span>`;
          return `<span class="inline-flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium text-gray-600" title="${escapeHtml(u.full_name || u.email || '')}">${avatar}${escapeHtml(u.full_name || u.email)}</span>`;
        }).join('')
      : '<span class="text-xs text-gray-400 italic">No members yet</span>';
  }

  function renderCommentContent(content) {
    if (!content) return '';
    if (content.startsWith('<')) return content;
    return escapeHtml(content);
  }

  // ─────────────────────────────────────────────
  // Comment item rendering (own vs other)
  // ─────────────────────────────────────────────
  function isOwnComment(comment) {
    const D2 = window.Dashboard;
    const currentUserId = D2.getCurrentUserId && D2.getCurrentUserId();
    if (!comment) return false;

    // วิธี 1: เทียบด้วย author.id
    if (comment.author && comment.author.id && currentUserId) {
      if (String(comment.author.id) === String(currentUserId)) return true;
    }
    // วิธี 2: เทียบด้วย user_id ตรงๆ (บาง backend)
    if (comment.user_id && currentUserId) {
      if (String(comment.user_id) === String(currentUserId)) return true;
    }
    // วิธี 3: เทียบด้วย email (fallback สุดท้าย)
    if (comment.author && comment.author.email) {
      const userNameEl = D2.getUserNameEl && D2.getUserNameEl();
      // หา current user's email/name จาก DOM header (user-menu)
      const me = D2.state && D2.state.currentUser;
      if (me && me.email && String(comment.author.email).toLowerCase() === String(me.email).toLowerCase()) return true;
      // หาก state ไม่มี currentUser object ลองใช้ full_name เปรียบเทียบ
      if (userNameEl && comment.author.full_name && userNameEl.textContent.trim() === comment.author.full_name.trim()) return true;
      if (userNameEl && comment.author.email && userNameEl.textContent.trim() === comment.author.email.trim()) return true;
    }
    return false;
  }

  // Build a nested tree from flat comment list using parent_id.
  // Returns an HTML string: root → then its replies (at depth 1) → replies of replies (depth 2), etc.
  function renderCommentThread(comments) {
    if (!Array.isArray(comments) || !comments.length) return '';

    // Index by id and group children by parent_id
    const byId = new Map();
    const childrenByParent = new Map();
    comments.forEach(c => {
      byId.set(String(c.id), c);
      const pid = c.parent_id ? String(c.parent_id) : null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(c);
    });

    // Sort each bucket by created_at ascending
    childrenByParent.forEach(arr => arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    }));

    // Recursive render — cap depth at 2 to keep indent manageable
    function renderBranch(c, depth) {
      const cappedDepth = Math.min(depth, 2);
      let html = renderCommentItem(c, cappedDepth);
      const kids = childrenByParent.get(String(c.id)) || [];
      kids.forEach(k => { html += renderBranch(k, depth + 1); });
      return html;
    }

    const roots = childrenByParent.get(null) || [];
    // Orphan fallback — if a comment references a non-existent parent, treat it as a root
    comments.forEach(c => {
      if (c.parent_id && !byId.has(String(c.parent_id))) {
        if (!roots.includes(c)) roots.push(c);
      }
    });
    roots.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    return roots.map(r => renderBranch(r, 0)).join('');
  }

  function renderCommentItem(c, depth = 0) {
    const author = (c.author && (c.author.full_name || c.author.email)) || 'Unknown';
    // Trello-style timestamp: "Apr 12, 2026, 9:26 PM"
    const when = formatCommentTimestamp(c.created_at);
    const whenIso = c.created_at || '';
    const pic = c.author && (c.author.profile_picture || c.author.avatar_url);
    // Smaller avatar for replies (depth > 0)
    const avatarSize = depth > 0 ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[11px]';
    const avatar = pic
      ? `<img src="${escapeHtml(coverSrc(pic))}" alt="${escapeHtml(author)}" class="${avatarSize} rounded-full object-cover flex-shrink-0"/>`
      : `<div class="${avatarSize} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style="background:${colorFor(author)}">${escapeHtml(initials(author))}</div>`;

    const isOwn = isOwnComment(c);
    const isEdited = !!c.updated_at && c.updated_at !== c.created_at;
    const editedBadge = isEdited ? ' <span class="pawtry-comment-edited">(edited)</span>' : '';
    const editedTooltip = isEdited && c.updated_at ? ` title="Edited ${escapeHtml(formatCommentTimestamp(c.updated_at))}"` : '';

    // Reactions (pills + picker smiley) — inline, no border
    const reactionsHtml = renderReactionsRow(c);

    // Actions: own = แก้ไข • ลบ | other = ตอบกลับ
    const actionsHtml = isOwn
      ? `<div class="pawtry-comment-actions">
           <button type="button" class="pawtry-comment-action-btn" data-comment-action="edit" data-comment-id="${escapeHtml(String(c.id))}">แก้ไข</button>
           <span class="pawtry-comment-action-sep">•</span>
           <button type="button" class="pawtry-comment-action-btn is-danger" data-comment-action="delete" data-comment-id="${escapeHtml(String(c.id))}">ลบ</button>
         </div>`
      : `<div class="pawtry-comment-actions">
           <button type="button" class="pawtry-comment-action-btn" data-comment-action="reply" data-comment-id="${escapeHtml(String(c.id))}">ตอบกลับ</button>
         </div>`;

    const depthClass = depth > 0 ? `pawtry-reply-item pawtry-reply-depth-${depth}` : '';
    // Inline style as a belt-and-suspenders guarantee: some parent rules (e.g. Tailwind `space-y-4`)
    // can affect layout, so we force the left indent directly on the element.
    const indentPx = depth >= 3 ? 144 : depth * 48;  // 0, 48, 96, 144
    const indentStyle = depth > 0 ? ` style="margin-left:${indentPx}px"` : '';

    return `<li class="flex gap-3 ${depthClass}"${indentStyle} data-comment-item="${escapeHtml(String(c.id))}" data-comment-depth="${depth}">
        ${avatar}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-sm font-semibold text-gray-800">${escapeHtml(author)}</span>
            <a href="#comment-${escapeHtml(String(c.id))}" class="pawtry-comment-timestamp" data-comment-id="${escapeHtml(String(c.id))}"${editedTooltip}>${escapeHtml(when)}</a>${editedBadge}
          </div>
          <div class="mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 break-words overflow-visible" data-comment-body="${escapeHtml(String(c.id))}">${renderCommentContent(c.content)}</div>
          <div class="pawtry-comment-footer">
            ${reactionsHtml}
            ${actionsHtml}
          </div>
        </div>
      </li>`;
  }

  // Trello-style timestamp formatter: "Apr 12, 2026, 9:26 PM"
  function formatCommentTimestamp(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) { return ''; }
  }

  // ─────────────────────────────────────────────
  // Reactions rendering
  // ─────────────────────────────────────────────
  function renderReactionsRow(c) {
    const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
    const reactions = Array.isArray(c.reactions) ? c.reactions : [];
    const pills = reactions.map(r => {
      const isMine = currentUserId && Array.isArray(r.user_ids) && r.user_ids.some(uid => String(uid) === String(currentUserId));
      return `<button type="button" class="pawtry-reaction-pill ${isMine ? 'is-mine' : ''}" data-reaction-toggle data-comment-id="${escapeHtml(String(c.id))}" data-emoji="${escapeHtml(r.emoji)}">
        <span class="pawtry-reaction-emoji">${escapeHtml(r.emoji)}</span>
        <span class="pawtry-reaction-count">${r.count}</span>
      </button>`;
    }).join('');

    // Trello-style: subtle smiley icon, no border
    const pickerBtn = `<button type="button" class="pawtry-reaction-picker-btn" data-reaction-picker data-comment-id="${escapeHtml(String(c.id))}" title="Add reaction">
      <span class="material-symbols-outlined">mood</span>
    </button>`;

    return `<div class="pawtry-reactions-row">${pills}${pickerBtn}</div>`;
  }

  function refreshReactionsRow(commentId, reactions) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const row = item.querySelector('.pawtry-reactions-row');
    if (!row) return;
    const fake = { id: commentId, reactions: reactions || [] };
    const newHtml = renderReactionsRow(fake);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newRow = tmp.firstElementChild;
    if (newRow) row.replaceWith(newRow);
  }

  async function toggleReaction(commentId, emoji) {
    try {
      const data = await api(`/comments/${commentId}/reactions`, { method: 'POST', body: { emoji } });
      const reactions = data && Array.isArray(data.reactions) ? data.reactions : [];

      // update cache
      const cached = taskCache.get(activeTaskId);
      if (cached && Array.isArray(cached.comments)) {
        const c = cached.comments.find(x => String(x.id) === String(commentId));
        if (c) c.reactions = reactions;
      }

      refreshReactionsRow(commentId, reactions);
    } catch (err) {
      console.error('toggle reaction failed:', err);
      if (showToast) {
        const msg = err.message && err.message.includes('404')
          ? 'Backend ยังไม่รองรับ reactions'
          : 'Could not toggle reaction';
        showToast(msg, 'error');
      }
    }
  }

  // ─────────────────────────────────────────────
  // Emoji picker (reuse the one from toolbar)
  // ─────────────────────────────────────────────
  function openReactionPicker(commentId, anchorBtn) {
    console.log('[openReactionPicker] called with', commentId);
    const emojiPopup = document.getElementById('pawtry-emoji-popup');
    if (!emojiPopup) {
      console.error('[openReactionPicker] pawtry-emoji-popup not found!');
      return;
    }
    // close other toolbar popups
    document.querySelectorAll('.pawtry-popup').forEach(p => p.classList.remove('is-open'));

    reactionPickerForCommentId = commentId;
    const rect = anchorBtn.getBoundingClientRect();
    emojiPopup.style.top = `${rect.bottom + 4}px`;
    emojiPopup.style.left = `${rect.left}px`;
    // bounds check
    const vw = window.innerWidth;
    const pw = emojiPopup.offsetWidth || 340;
    if (rect.left + pw > vw - 16) {
      emojiPopup.style.left = `${Math.max(8, vw - pw - 16)}px`;
    }
    emojiPopup.classList.add('is-open');
    console.log('[openReactionPicker] popup OPENED, reactionPickerForCommentId:', reactionPickerForCommentId);
  }

  // Hook into emoji-picker element (it's already in the DOM from the toolbar setup)
  // Uses capture phase + stopImmediatePropagation to guarantee the toolbar's
  // bubble-phase handler NEVER fires when this is a reaction context.
  (function wireReactionEmojiPicker() {
    const emojiPopup = document.getElementById('pawtry-emoji-popup');
    if (!emojiPopup) return;
    const picker = emojiPopup.querySelector('emoji-picker');
    if (!picker) return;
    picker.addEventListener('emoji-click', (ev) => {
      if (reactionPickerForCommentId) {
        const commentId = reactionPickerForCommentId;
        reactionPickerForCommentId = null;
        emojiPopup.classList.remove('is-open');
        // Prevent toolbar bubble-phase handler from inserting emoji into main editor
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        ev.preventDefault();
        toggleReaction(commentId, ev.detail.unicode);
      }
      // if not in reaction context, the toolbar's own handler handles it
    }, true);  // capture phase = runs BEFORE the toolbar's bubble handler
  })();

  // ─────────────────────────────────────────────
  // Reply form
  // ─────────────────────────────────────────────
  // Map: commentId → Quill instance (for reply editors)
  const replyQuills = new Map();

  function showReplyForm(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    // remove any existing reply form first
    const existing = item.querySelector('.pawtry-reply-form');
    if (existing) {
      replyQuills.delete(commentId);
      existing.remove();
      return;  // toggle off
    }

    const body = item.querySelector('.flex-1');
    if (!body) return;

    const form = document.createElement('div');
    form.className = 'pawtry-reply-form';
    form.dataset.replyForm = commentId;
    form.innerHTML = `
      <div class="pawtry-reply-quill-container">
        <div class="pawtry-reply-toolbar" data-reply-toolbar="${escapeHtml(commentId)}">
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn with-caret" data-reply-action="header-menu" title="Text style">
              <span style="font-weight:700">Tt</span>
              <span class="caret material-symbols-outlined">expand_more</span>
            </button>
          </div>
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn" data-reply-action="bold" title="Bold"><b>B</b></button>
            <button type="button" class="pawtry-tb-btn" data-reply-action="italic" title="Italic"><i>I</i></button>
          </div>
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn" data-reply-action="more" title="More formatting">
              <span class="material-symbols-outlined">more_horiz</span>
            </button>
          </div>
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn with-caret" data-reply-action="list-menu" title="Lists">
              <span class="material-symbols-outlined">format_list_bulleted</span>
              <span class="caret material-symbols-outlined">expand_more</span>
            </button>
          </div>
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn with-caret" data-reply-action="insert" title="Insert">
              <span class="material-symbols-outlined">add</span>
              <span class="caret material-symbols-outlined">expand_more</span>
            </button>
          </div>
          <div class="pawtry-tb-group">
            <button type="button" class="pawtry-tb-btn" data-reply-action="mention" title="Mention">
              <span style="font-weight:700;font-size:15px">@</span>
            </button>
          </div>
        </div>
        <div data-reply-editor="${escapeHtml(commentId)}"></div>
      </div>
      <div class="pawtry-reply-actions">
        <button type="button" class="pawtry-comment-edit-save" data-reply-send="${escapeHtml(commentId)}">ส่ง</button>
        <button type="button" class="pawtry-comment-edit-cancel" data-reply-cancel="${escapeHtml(commentId)}">ยกเลิก</button>
      </div>
    `;
    body.appendChild(form);

    // Init Quill on the editor div
    const editorDiv = form.querySelector(`[data-reply-editor="${commentId}"]`);
    if (editorDiv && typeof Quill !== 'undefined') {
      try {
        const replyQuill = new Quill(editorDiv, {
          theme: 'snow',
          placeholder: 'Write a reply...',
          modules: { toolbar: false },
        });
        replyQuills.set(commentId, replyQuill);

        // Attach mention support to this Quill
        attachMentionSupport(replyQuill);

        // Wire up toolbar buttons for this reply form
        wireReplyToolbar(commentId, replyQuill, form);

        // Highlight active formatting buttons (B, I)
        replyQuill.on('selection-change', () => updateReplyToolbarActive(commentId, replyQuill));
        replyQuill.on('text-change', () => updateReplyToolbarActive(commentId, replyQuill));

        // Auto-insert mention of parent comment's author
        const parent = getCachedComment(commentId);
        if (parent && parent.author && parent.author.id) {
          const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
          // don't mention yourself
          if (String(parent.author.id) !== String(currentUserId)) {
            const name = escapeHtml(parent.author.full_name || parent.author.email || '');
            const uid  = escapeHtml(String(parent.author.id));
            const html = `<span class="pawtry-mention" data-mention="${uid}">@${name}</span>&nbsp;`;
            try {
              const delta = replyQuill.clipboard.convert(html);
              replyQuill.updateContents(
                new (Quill.import('delta'))().concat(delta),
                Quill.sources.SILENT
              );
              // move cursor to end
              replyQuill.setSelection(replyQuill.getLength(), 0, Quill.sources.SILENT);
            } catch (e) {
              console.warn('auto-mention failed:', e);
            }
          }
        }

        // Focus
        setTimeout(() => replyQuill.focus(), 50);
      } catch (err) {
        console.error('reply quill init failed:', err);
      }
    }
  }

  function updateReplyToolbarActive(commentId, q) {
    if (!q) return;
    const range = q.getSelection();
    if (!range) return;
    const fmt = q.getFormat(range);
    const setActive = (action, on) => {
      const btn = document.querySelector(`[data-reply-toolbar="${commentId}"] [data-reply-action="${action}"]`);
      if (btn) btn.classList.toggle('is-active', !!on);
    };
    setActive('bold', fmt.bold);
    setActive('italic', fmt.italic);
  }

  function wireReplyToolbar(commentId, replyQuill, formEl) {
    // Reuse global popups — but need a way to anchor them to reply toolbar
    const insertMenu   = document.getElementById('pawtry-insert-menu');
    const moreMenu     = document.getElementById('pawtry-more-menu');
    const headerMenu   = document.getElementById('pawtry-header-menu');
    const listMenu     = document.getElementById('pawtry-list-menu');
    const emojiPopup   = document.getElementById('pawtry-emoji-popup');
    const linkDialog   = document.getElementById('pawtry-link-dialog');
    const attachInput  = document.getElementById('pawtry-attach-input');

    function closeAllPopups() {
      [insertMenu, moreMenu, headerMenu, listMenu, emojiPopup, linkDialog]
        .forEach(p => p && p.classList.remove('is-open'));
    }
    function positionPopup(popup, anchor) {
      const rect = anchor.getBoundingClientRect();
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.left = `${rect.left}px`;
      const vw = window.innerWidth;
      const pw = popup.offsetWidth || 300;
      if (rect.left + pw > vw - 16) {
        popup.style.left = `${Math.max(8, vw - pw - 16)}px`;
      }
    }

    // Track which quill the popups are serving right now
    const tbEl = formEl.querySelector(`[data-reply-toolbar="${commentId}"]`);

    tbEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-reply-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.replyAction;
      replyQuill.focus();

      if (['bold', 'italic'].includes(action)) {
        const range = replyQuill.getSelection();
        if (range) {
          const cur = replyQuill.getFormat(range);
          replyQuill.format(action, !cur[action]);
          updateReplyToolbarActive(commentId, replyQuill);
        }
        return;
      }

      // Set "active popup owner" so the popup's selection applies to replyQuill
      replyToolbarActiveQuill = replyQuill;

      if (action === 'header-menu') {
        closeAllPopups(); headerMenu.classList.add('is-open'); positionPopup(headerMenu, btn);
      } else if (action === 'list-menu') {
        closeAllPopups(); listMenu.classList.add('is-open'); positionPopup(listMenu, btn);
      } else if (action === 'more') {
        closeAllPopups(); moreMenu.classList.add('is-open'); positionPopup(moreMenu, btn);
      } else if (action === 'insert') {
        closeAllPopups();
        const searchInput = document.getElementById('pawtry-insert-search-input');
        const listEl = document.getElementById('pawtry-insert-list');
        if (searchInput) searchInput.value = '';
        // trigger re-render by dispatching input event (the main toolbar's listener handles this)
        if (searchInput) searchInput.dispatchEvent(new Event('input'));
        insertMenu.classList.add('is-open');
        positionPopup(insertMenu, btn);
        if (searchInput) setTimeout(() => searchInput.focus(), 30);
      } else if (action === 'mention') {
        // Trigger @ at cursor
        const sel = replyQuill.getSelection(true) || { index: replyQuill.getLength(), length: 0 };
        replyQuill.insertText(sel.index, '@', Quill.sources.USER);
        replyQuill.setSelection(sel.index + 1, Quill.sources.SILENT);
        // mention menu will open via text-change listener
      }
    });
  }

  function hideReplyForm(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const form = item.querySelector(`[data-reply-form="${commentId}"]`);
    if (form) form.remove();
    replyQuills.delete(commentId);
  }

  function getReplyContent(commentId) {
    const q = replyQuills.get(commentId);
    if (!q) return '';
    const text = q.getText().trim();
    if (!text) return '';
    const html = q.root.innerHTML;
    if (html === '<p><br></p>' || html === '<p></p>' || html.trim() === '') return '';
    return html;
  }

  async function submitReply(parentCommentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${parentCommentId}"]`);
    if (!item) return;
    const sendBtn = item.querySelector(`[data-reply-send="${parentCommentId}"]`);
    const contentHtml = getReplyContent(parentCommentId);
    if (!contentHtml) {
      const q = replyQuills.get(parentCommentId);
      if (q) q.focus();
      return;
    }

    if (sendBtn) sendBtn.disabled = true;
    try {
      const data = await api(`/tasks/${activeTaskId}/comments`, {
        method: 'POST',
        body: { content: contentHtml, parent_id: parentCommentId },
      });
      const comment = data && data.comment;

      // update cache
      const cached = taskCache.get(activeTaskId);
      if (cached) {
        cached.comments = Array.isArray(cached.comments) ? cached.comments : [];
        cached.comments.push(comment);
      }

      // render the new reply with indent based on parent depth
      const parentDepth = parseInt(item.dataset.commentDepth || '0', 10);
      const replyDepth = Math.min(parentDepth + 1, 2);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCommentItem(comment, replyDepth);
      const li = wrapper.firstElementChild;
      if (li) {
        // Insert reply AFTER the parent AND after any existing replies of the parent
        let insertAfter = item;
        let next = item.nextElementSibling;
        while (next && parseInt(next.dataset.commentDepth || '0', 10) > parentDepth) {
          insertAfter = next;
          next = next.nextElementSibling;
        }
        insertAfter.insertAdjacentElement('afterend', li);
      }

      hideReplyForm(parentCommentId);
      if (showToast) showToast('Reply sent', 'check');
    } catch (err) {
      console.error('reply failed:', err);
      if (showToast) showToast('Could not send reply', 'error');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────
  // Mention support — works for any Quill instance
  // ─────────────────────────────────────────────
  const mentionMenu = document.getElementById('pawtry-mention-menu');
  let mentionActiveQuill = null;
  let mentionStartIndex  = -1;      // index where '@' was typed
  let mentionQuery       = '';
  let mentionFocusedIdx  = 0;
  let mentionFilteredUsers = [];

  function attachMentionSupport(quillInstance) {
    if (!quillInstance || quillInstance._pawtryMentionWired) return;
    quillInstance._pawtryMentionWired = true;

    quillInstance.on('text-change', (delta, oldDelta, source) => {
      if (source !== 'user') return;
      onMentionTextChange(quillInstance);
    });

    // Handle Enter/ArrowUp/ArrowDown/Esc inside the picker
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
    // Find the last '@' before cursor. Must be at start, after whitespace, or at start of line.
    // More permissive: just need '@' not immediately after a word character.
    const atMatch = text.match(/(^|[\s\n\r])@([a-zA-Z0-9ก-๙\u0E00-\u0E7F._\- ]{0,30})$/);
    console.log('[mention] text-change, text ending:', JSON.stringify(text.slice(-30)), 'match:', atMatch && atMatch[2]);
    if (!atMatch) { closeMentionMenu(); return; }

    const query = atMatch[2];
    mentionActiveQuill = quillInstance;
    // atMatch.index is where the prefix char starts; add length of prefix (0 or 1)
    const prefixLen = atMatch[1] ? atMatch[1].length : 0;
    mentionStartIndex = atMatch.index + prefixLen;  // points exactly to '@'
    mentionQuery = query;

    console.log('[mention] opening menu, query:', query, 'startIndex:', mentionStartIndex);
    openMentionMenu(query);
  }

  function openMentionMenu(query) {
    const members = (D.getBoardMembersCache && D.getBoardMembersCache()) || [];
    console.log('[mention] openMentionMenu query:', query, 'members count:', members.length);
    const q = (query || '').toLowerCase().trim();
    mentionFilteredUsers = members.filter(u => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return !q || name.includes(q) || email.includes(q);
    }).slice(0, 8);

    console.log('[mention] filtered users:', mentionFilteredUsers.length);
    if (!mentionFilteredUsers.length) { closeMentionMenu(); return; }
    mentionFocusedIdx = 0;
    renderMentionMenu();
    positionMentionMenu();
    mentionMenu.classList.add('is-open');
    console.log('[mention] menu OPENED at', mentionMenu.style.top, mentionMenu.style.left);
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
      // clamp to viewport
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

    // length of text from '@' up to cursor (the query text)
    const queryLen = sel.index - mentionStartIndex;
    // delete the '@query' we just typed
    q.deleteText(mentionStartIndex, queryLen, Quill.sources.USER);

    // build the mention as HTML and insert via clipboard
    const name = escapeHtml(user.full_name || user.email || '');
    const uid  = escapeHtml(String(user.id));
    const html = `<span class="pawtry-mention" data-mention="${uid}">@${name}</span>&nbsp;`;

    // Use clipboard to convert HTML → Quill Delta at the cursor position
    const delta = q.clipboard.convert(html);
    q.updateContents(
      new (Quill.import('delta'))()
        .retain(mentionStartIndex)
        .concat(delta),
      Quill.sources.USER
    );

    // move cursor to after the inserted content
    q.setSelection(mentionStartIndex + (delta.length() || 1), Quill.sources.SILENT);
  }

  function closeMentionMenu() {
    mentionMenu.classList.remove('is-open');
    mentionMenu.innerHTML = '';
    mentionActiveQuill = null;
    mentionStartIndex  = -1;
    mentionQuery       = '';
    mentionFilteredUsers = [];
  }

  // Click on mention menu item
  mentionMenu.addEventListener('mousedown', (e) => {
    // mousedown (not click) so editor doesn't lose selection before we insert
    e.preventDefault();
    const item = e.target.closest('[data-mention-user-id]');
    if (!item) return;
    const user = mentionFilteredUsers.find(u => String(u.id) === item.dataset.mentionUserId);
    if (user) { insertMentionIntoQuill(user); closeMentionMenu(); }
  });

  // Close mention menu if clicking elsewhere
  document.addEventListener('click', (e) => {
    if (e.target.closest('#pawtry-mention-menu')) return;
    if (e.target.closest('#modal-comment-quill')) return;
    if (e.target.closest('[data-reply-editor]')) return;
    if (e.target.closest('.pawtry-reply-toolbar')) return;
    if (e.target.closest('.pawtry-popup')) return;
    closeMentionMenu();
  });

  // ─────────────────────────────────────────────
  // Comment edit mode
  // ─────────────────────────────────────────────
  function getCachedComment(commentId) {
    if (!activeTaskId) return null;
    const cached = taskCache.get(activeTaskId);
    if (!cached || !Array.isArray(cached.comments)) return null;
    return cached.comments.find(x => String(x.id) === String(commentId)) || null;
  }

  function commentToEditableText(content) {
    if (!content) return '';
    // ถ้าเป็น HTML → strip tags กลับเป็น plain text พร้อม newlines
    if (content.startsWith('<')) {
      const tmp = document.createElement('div');
      tmp.innerHTML = content;
      // แทน </p> ด้วย newline แล้ว get text
      tmp.querySelectorAll('p').forEach(p => { p.insertAdjacentText('afterend', '\n'); });
      tmp.querySelectorAll('br').forEach(br => { br.replaceWith('\n'); });
      return tmp.textContent.trim();
    }
    return content;
  }

  function enterEditMode(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const body = item.querySelector(`[data-comment-body="${commentId}"]`);
    const actions = item.querySelector('.pawtry-comment-actions');
    if (!body) return;

    const comment = getCachedComment(commentId);
    const editableText = commentToEditableText(comment ? comment.content : body.innerHTML);

    // hide view, swap to editor
    body.style.display = 'none';
    if (actions) actions.style.display = 'none';

    const editor = document.createElement('div');
    editor.className = 'pawtry-comment-edit-container';
    editor.dataset.commentEditor = commentId;
    editor.dataset.originalText = editableText;  // keep original for change detection
    editor.innerHTML = `
      <div class="pawtry-comment-edit-wrapper">
        <textarea class="pawtry-comment-edit-textarea" data-edit-textarea="${escapeHtml(commentId)}">${escapeHtml(editableText)}</textarea>
      </div>
      <div class="pawtry-comment-edit-actions">
        <button type="button" class="pawtry-comment-edit-save" data-edit-save="${escapeHtml(commentId)}">บันทึก</button>
        <button type="button" class="pawtry-comment-edit-cancel" data-edit-cancel="${escapeHtml(commentId)}">ยกเลิกการเปลี่ยนแปลง</button>
      </div>
    `;
    body.parentElement.insertBefore(editor, body);

    const ta = editor.querySelector('textarea');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  function exitEditMode(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const body = item.querySelector(`[data-comment-body="${commentId}"]`);
    const actions = item.querySelector('.pawtry-comment-actions');
    const editor = item.querySelector(`[data-comment-editor="${commentId}"]`);
    if (body) body.style.display = '';
    if (actions) actions.style.display = '';
    if (editor) editor.remove();
  }

  async function saveEditedComment(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const ta = item.querySelector(`[data-edit-textarea="${commentId}"]`);
    const saveBtn = item.querySelector(`[data-edit-save="${commentId}"]`);
    if (!ta) return;

    const newContentPlain = ta.value.trim();
    if (!newContentPlain) { alert('เนื้อหาว่างไม่ได้'); ta.focus(); return; }

    // แปลง plain text กลับเป็น HTML (ใช้ <p> wrapper เหมือน Quill)
    const newContentHtml = newContentPlain
      .split(/\n+/)
      .map(line => `<p>${escapeHtml(line)}</p>`)
      .join('');

    if (saveBtn) saveBtn.disabled = true;
    try {
      const data = await api(`/comments/${commentId}`, { method: 'PUT', body: { content: newContentHtml } });
      const updated = data && data.comment;

      // update cache
      const cached = taskCache.get(activeTaskId);
      if (cached && Array.isArray(cached.comments)) {
        const idx = cached.comments.findIndex(x => String(x.id) === String(commentId));
        if (idx !== -1) {
          cached.comments[idx] = updated || { ...cached.comments[idx], content: newContentHtml, updated_at: new Date().toISOString() };
        }
      }

      // update DOM
      const body = item.querySelector(`[data-comment-body="${commentId}"]`);
      if (body) body.innerHTML = renderCommentContent(newContentHtml);
      // add/update "(edited)" marker — look for the header row and append after the timestamp link
      const headerRow = item.querySelector('.flex.items-baseline');
      if (headerRow && !headerRow.querySelector('.pawtry-comment-edited')) {
        const tsLink = headerRow.querySelector('.pawtry-comment-timestamp');
        if (tsLink) {
          tsLink.insertAdjacentHTML('afterend', ' <span class="pawtry-comment-edited">(edited)</span>');
        } else {
          headerRow.insertAdjacentHTML('beforeend', ' <span class="pawtry-comment-edited">(edited)</span>');
        }
      }

      exitEditMode(commentId);
      if (showToast) showToast('Comment updated', 'check');
    } catch (err) {
      console.error('edit comment failed:', err);
      if (showToast) {
        const msg = err.message && err.message.includes('404')
          ? 'Backend ยังไม่รองรับการแก้ไขคอมเม้น'
          : 'Could not save edit';
        showToast(msg, 'error');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteComment(commentId) {
    if (!confirm('ลบคอมเม้นนี้?')) return;
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);

    try {
      await api(`/comments/${commentId}`, { method: 'DELETE' });

      // update cache
      const cached = taskCache.get(activeTaskId);
      if (cached && Array.isArray(cached.comments)) {
        cached.comments = cached.comments.filter(x => String(x.id) !== String(commentId));
      }
      // remove from DOM
      if (item) item.remove();

      // ถ้าไม่เหลือคอมเม้น แสดง empty state
      if (modalCommentsList.children.length === 0) {
        modalCommentsList.innerHTML = '<li class="text-xs text-gray-400 italic pl-11">No comments yet</li>';
      }

      if (showToast) showToast('Comment deleted', 'check');
    } catch (err) {
      console.error('delete comment failed:', err);
      if (showToast) {
        const msg = err.message && err.message.includes('404')
          ? 'Backend ยังไม่รองรับการลบคอมเม้น'
          : 'Could not delete comment';
        showToast(msg, 'error');
      }
    }
  }

  // event delegation: edit / delete / save / cancel / reply / reaction buttons
  modalCommentsList.addEventListener('click', (e) => {
    // Timestamp link — prevent navigation, optionally flash the comment
    const tsLink = e.target.closest('.pawtry-comment-timestamp');
    if (tsLink) {
      e.preventDefault();
      // Brief highlight so user sees which one they clicked
      const li = tsLink.closest('[data-comment-item]');
      if (li) {
        li.classList.add('pawtry-comment-flash');
        setTimeout(() => li.classList.remove('pawtry-comment-flash'), 1200);
      }
      return;
    }
    // Reaction picker button — check FIRST before anything else, stop bubbling
    const pickerBtn = e.target.closest('[data-reaction-picker]');
    if (pickerBtn) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Reaction] Opening picker for', pickerBtn.dataset.commentId);
      openReactionPicker(pickerBtn.dataset.commentId, pickerBtn);
      return;
    }
    // Reaction pill (toggle)
    const pill = e.target.closest('[data-reaction-toggle]');
    if (pill) {
      e.preventDefault();
      e.stopPropagation();
      toggleReaction(pill.dataset.commentId, pill.dataset.emoji);
      return;
    }

    const actionBtn = e.target.closest('[data-comment-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.commentAction;
      const id = actionBtn.dataset.commentId;
      if (action === 'edit')   enterEditMode(id);
      else if (action === 'delete') deleteComment(id);
      else if (action === 'reply')  showReplyForm(id);
      return;
    }
    const saveBtn = e.target.closest('[data-edit-save]');
    if (saveBtn) { saveEditedComment(saveBtn.dataset.editSave); return; }
    const cancelBtn = e.target.closest('[data-edit-cancel]');
    if (cancelBtn) { exitEditMode(cancelBtn.dataset.editCancel); return; }

    // Reply form buttons
    const replySend = e.target.closest('[data-reply-send]');
    if (replySend) { submitReply(replySend.dataset.replySend); return; }
    const replyCancel = e.target.closest('[data-reply-cancel]');
    if (replyCancel) { hideReplyForm(replyCancel.dataset.replyCancel); return; }
  });

  // ─────────────────────────────────────────────
  // Open / Close modal
  // ─────────────────────────────────────────────
  function openTaskModal(taskId) {
    const task = taskCache.get(String(taskId));
    if (!task) return;

    modalMode      = 'edit';
    activeTaskId   = String(taskId);
    activeColumnId = task.column_id;

    modalEditOnlySections.forEach(s => s && s.classList.remove('hidden'));
    if (modalSidebar) modalSidebar.classList.remove('hidden');

    modalTitle.value = task.title || '';
    modalDesc.value  = task.description || '';
    if (window._pawtrySetDescView) window._pawtrySetDescView(task.description || '');

    const boardTitleEl = D.getBoardTitleEl ? D.getBoardTitleEl() : document.getElementById('board-title');
    if (modalBoardName) modalBoardName.textContent = boardTitleEl ? boardTitleEl.textContent.trim() : '';

    const due = formatDueDate(task.due_date);
    if (due) {
      modalDueText.textContent = due;
      modalDueSection.classList.remove('hidden');
    } else {
      modalDueSection.classList.add('hidden');
    }

    if (task.due_date) {
      const iso = String(task.due_date);
      modalDueInput.value = iso.length === 10 ? `${iso}T09:00` : iso.slice(0, 16);
    } else {
      modalDueInput.value = '';
    }

    const isComplete = !!task.is_completed;
    modalCompleteCheckbox.checked = isComplete;
    paintDueComplete(isComplete);

    const columnsEl = getColumnsEl();
    const colEl    = columnsEl.querySelector(`.kanban-column[data-column-id="${task.column_id}"]`);
    const colTitle = colEl ? colEl.querySelector('h3') : null;
    modalStatus.textContent = colTitle ? colTitle.textContent.trim() : '—';

    refreshAssigneesDisplay(task);
    refreshLabelsDisplay(task);
    renderMembersPopup(task);
    renderLabelsPopup(task);

    if (modalAttachmentsSection) modalAttachmentsSection.classList.remove('hidden');
    renderAttachments(task.attachments || []);
    refreshAttachmentsFromServer();

    const comments = Array.isArray(task.comments) ? task.comments : [];
    modalCommentsList.innerHTML = comments.length
      ? renderCommentThread(comments)
      : '<li class="text-xs text-gray-400 italic pl-11">No comments yet</li>';

    const userNameEl = getUserNameEl();
    if (modalCommentAvatar) {
      const name = userNameEl && userNameEl.textContent.trim();
      modalCommentAvatar.textContent = name ? name[0].toUpperCase() : 'U';
    }

    clearQuillContent();

    if (modalDeleteBtn) {
      modalDeleteBtn.classList.remove('hidden');
      modalDeleteBtn.innerHTML = '<span class="material-symbols-outlined text-base">delete</span>Delete';
      modalDeleteBtn.disabled = false;
    }
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined text-base">save</span> Save Changes';
    modalSaveBtn.disabled = false;
    closeAllPopups();
    modalEl.classList.remove('hidden');

    setTimeout(initQuill, 100);
  }

  function openCreateModal(columnId) {
    modalMode      = 'create';
    activeTaskId   = null;
    activeColumnId = columnId;

    modalTitle.value = '';
    modalDesc.value  = '';
    if (window._pawtrySetDescView) window._pawtrySetDescView('');

    const boardTitleEl = D.getBoardTitleEl ? D.getBoardTitleEl() : document.getElementById('board-title');
    if (modalBoardName) modalBoardName.textContent = boardTitleEl ? boardTitleEl.textContent.trim() : '';

    const columnsEl = getColumnsEl();
    const colEl    = columnsEl.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
    const colTitle = colEl ? colEl.querySelector('h3') : null;
    if (modalStatus) modalStatus.textContent = colTitle ? colTitle.textContent.trim() : '—';

    modalEditOnlySections.forEach(s => s && s.classList.add('hidden'));
    if (modalAttachmentsSection) modalAttachmentsSection.classList.add('hidden');
    if (modalSidebar) modalSidebar.classList.remove('hidden');

    if (modalDeleteBtn) modalDeleteBtn.classList.add('hidden');
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined text-base">add_task</span> Create Task';
    modalSaveBtn.disabled = false;

    closeAllPopups();
    modalEl.classList.remove('hidden');
    modalTitle.focus();
  }

  function closeTaskModal() {
    if (window._pawtryExitDescEdit) window._pawtryExitDescEdit();
    modalEl.classList.add('hidden');
    closeAllPopups();
    // also close the "more actions" menu if open
    const mm = document.getElementById('modal-more-menu');
    const mv = document.getElementById('modal-move-menu');
    if (mm) mm.classList.add('hidden');
    if (mv) mv.classList.add('hidden');
    activeTaskId = null;
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeTaskModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target.closest('#modal-panel')) return;
    closeTaskModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTaskModal(); });

  // ─────────────────────────────────────────────
  // More actions dropdown (⋯ button)
  // ─────────────────────────────────────────────
  const modalMoreBtn  = document.getElementById('modal-more-btn');
  const modalMoreMenu = document.getElementById('modal-more-menu');
  const modalMoveMenu = document.getElementById('modal-move-menu');
  const modalMoveList = document.getElementById('modal-move-list');
  const modalMoveBack = document.getElementById('modal-move-back');
  const modalCopyMenu   = document.getElementById('modal-copy-menu');
  const modalCopyBack   = document.getElementById('modal-copy-back');
  const modalCopyTitle  = document.getElementById('modal-copy-title');
  const modalCopyColumn = document.getElementById('modal-copy-column');
  const modalCopySubmit = document.getElementById('modal-copy-submit');
  const modalShareMenu  = document.getElementById('modal-share-menu');
  const modalShareBack  = document.getElementById('modal-share-back');
  const modalShareUrl   = document.getElementById('modal-share-url');
  const modalShareCopy  = document.getElementById('modal-share-copy');
  const modalShareFeedback = document.getElementById('modal-share-feedback');

  function closeMoreMenu() {
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    if (modalMoveMenu) modalMoveMenu.classList.add('hidden');
    if (modalCopyMenu) modalCopyMenu.classList.add('hidden');
    if (modalShareMenu) modalShareMenu.classList.add('hidden');
  }
  function openMoreMenu() {
    if (!modalMoreMenu) return;
    closeMoreMenu();
    modalMoreMenu.classList.remove('hidden');
    updateJoinLabel();
    updateWatchLabel();
  }

  function openCopyMenu() {
    if (!modalCopyMenu || !activeTaskId) return;
    const task = taskCache.get(activeTaskId);
    if (!task) return;
    if (modalCopyTitle) modalCopyTitle.value = task.title || '';
    const columnsEl = getColumnsEl();
    const columnEls = columnsEl.querySelectorAll('.kanban-column');
    if (modalCopyColumn) {
      const opts = [];
      columnEls.forEach(colEl => {
        const colId = colEl.dataset.columnId;
        const titleEl = colEl.querySelector('h3');
        const title = titleEl ? titleEl.textContent.trim() : colId;
        const sel = String(colId) === String(task.column_id) ? ' selected' : '';
        opts.push(`<option value="${escapeHtml(String(colId))}"${sel}>${escapeHtml(title)}</option>`);
      });
      modalCopyColumn.innerHTML = opts.join('');
    }
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalCopyMenu.classList.remove('hidden');
  }

  function openShareMenu() {
    if (!modalShareMenu || !activeTaskId) return;
    const url = `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(activeTaskId)}`;
    if (modalShareUrl) modalShareUrl.value = url;
    if (modalShareFeedback) modalShareFeedback.classList.add('hidden');
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalShareMenu.classList.remove('hidden');
    setTimeout(() => modalShareUrl && modalShareUrl.select(), 50);
  }

  function isUserJoined(task) {
    const me = D.getCurrentUserId && D.getCurrentUserId();
    if (!me || !task || !Array.isArray(task.assignees)) return false;
    return task.assignees.some(u => String(u.id) === String(me));
  }
  function isUserWatching(task) {
    const me = D.getCurrentUserId && D.getCurrentUserId();
    if (!me || !task || !Array.isArray(task.watchers)) return false;
    return task.watchers.some(uid => String(uid) === String(me));
  }
  function updateJoinLabel() {
    const label = document.querySelector('[data-join-label]');
    if (!label || !activeTaskId) return;
    const task = taskCache.get(activeTaskId);
    label.textContent = isUserJoined(task) ? 'Leave' : 'Join';
  }
  function updateWatchLabel() {
    const label = document.querySelector('[data-watch-label]');
    if (!label || !activeTaskId) return;
    const task = taskCache.get(activeTaskId);
    label.textContent = isUserWatching(task) ? 'Unwatch' : 'Watch';
  }
  function openMoveMenu() {
    if (!modalMoveMenu || !activeTaskId) return;
    const task = taskCache.get(activeTaskId);
    if (!task) return;
    const columnsEl = getColumnsEl();
    const columnEls = columnsEl.querySelectorAll('.kanban-column');
    const options = [];
    columnEls.forEach(colEl => {
      const colId = colEl.dataset.columnId;
      const titleEl = colEl.querySelector('h3');
      const title = titleEl ? titleEl.textContent.trim() : colId;
      const isCurrent = String(colId) === String(task.column_id);
      options.push(`<button type="button" class="pawtry-move-option ${isCurrent ? 'is-current' : ''}" data-column-id="${escapeHtml(String(colId))}">
        <span class="material-symbols-outlined" style="font-size:16px">${isCurrent ? 'check' : 'view_column'}</span>
        <span>${escapeHtml(title)}</span>
      </button>`);
    });
    if (modalMoveList) modalMoveList.innerHTML = options.join('');
    if (modalMoreMenu) modalMoreMenu.classList.add('hidden');
    modalMoveMenu.classList.remove('hidden');
  }

  if (modalMoreBtn) {
    modalMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const anyOpen = (
        (modalMoreMenu && !modalMoreMenu.classList.contains('hidden')) ||
        (modalMoveMenu && !modalMoveMenu.classList.contains('hidden')) ||
        (modalCopyMenu && !modalCopyMenu.classList.contains('hidden')) ||
        (modalShareMenu && !modalShareMenu.classList.contains('hidden'))
      );
      if (anyOpen) closeMoreMenu(); else openMoreMenu();
    });
  }
  if (modalMoveBack) {
    modalMoveBack.addEventListener('click', () => {
      if (modalMoveMenu) modalMoveMenu.classList.add('hidden');
      openMoreMenu();
    });
  }
  if (modalCopyBack) {
    modalCopyBack.addEventListener('click', () => {
      if (modalCopyMenu) modalCopyMenu.classList.add('hidden');
      openMoreMenu();
    });
  }
  if (modalShareBack) {
    modalShareBack.addEventListener('click', () => {
      if (modalShareMenu) modalShareMenu.classList.add('hidden');
      openMoreMenu();
    });
  }
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (e.target.closest('#modal-more-btn')) return;
    if (e.target.closest('#modal-more-menu')) return;
    if (e.target.closest('#modal-move-menu')) return;
    if (e.target.closest('#modal-copy-menu')) return;
    if (e.target.closest('#modal-share-menu')) return;
    closeMoreMenu();
  });

  // Wire menu actions
  if (modalMoreMenu) {
    modalMoreMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'move') {
        openMoveMenu();
      } else if (action === 'copy') {
        openCopyMenu();
      } else if (action === 'join') {
        if (!activeTaskId) { closeMoreMenu(); return; }
        const me = D.getCurrentUserId && D.getCurrentUserId();
        if (!me) { closeMoreMenu(); return; }
        closeMoreMenu();
        try {
          await api(`/tasks/${activeTaskId}/assignees`, { method: 'POST', body: { user_id: me } });
          const task = taskCache.get(activeTaskId);
          if (task) {
            task.assignees = Array.isArray(task.assignees) ? task.assignees : [];
            const already = task.assignees.find(u => String(u.id) === String(me));
            if (already) {
              task.assignees = task.assignees.filter(u => String(u.id) !== String(me));
            } else {
              const members = D.getBoardMembersCache && D.getBoardMembersCache();
              const self = members && members.find(u => String(u.id) === String(me));
              task.assignees.push(self || { id: me, full_name: 'Me' });
            }
            if (window.Dashboard.renderAssignees) window.Dashboard.renderAssignees(task);
          }
          if (showToast) showToast('Updated card members', 'check');
        } catch (err) {
          console.error('join failed:', err);
          if (showToast) showToast('Could not update membership', 'error');
        }
      } else if (action === 'watch') {
        if (!activeTaskId) { closeMoreMenu(); return; }
        closeMoreMenu();
        try {
          const data = await api(`/tasks/${activeTaskId}/watch`, { method: 'POST' });
          const task = taskCache.get(activeTaskId);
          if (task && data && Array.isArray(data.watchers)) task.watchers = data.watchers;
          if (showToast) showToast(
            (data && data.watching) ? 'Watching this card' : 'Stopped watching',
            'check'
          );
        } catch (err) {
          console.error('watch toggle failed:', err);
          if (showToast) showToast('Could not toggle watch', 'error');
        }
      } else if (action === 'archive') {
        if (!activeTaskId) { closeMoreMenu(); return; }
        if (!confirm('Archive this card? You can restore it later from the board archive.')) return;
        closeMoreMenu();
        try {
          await api(`/tasks/${activeTaskId}/archive`, { method: 'POST' });
          const columnsEl = getColumnsEl();
          const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
          if (card) {
            const columnEl = card.closest('.kanban-column');
            card.remove();
            if (columnEl && updateColumnBadge) updateColumnBadge(columnEl);
          }
          taskCache.delete(activeTaskId);
          closeTaskModal();
          if (showToast) showToast('Card archived', 'archive');
        } catch (err) {
          console.error('archive failed:', err);
          if (showToast) showToast('Could not archive card', 'error');
        }
      } else if (action === 'share') {
        if (!activeTaskId) { closeMoreMenu(); return; }
        openShareMenu();
      }
    });
  }

  // Copy dialog submit
  if (modalCopySubmit) {
    modalCopySubmit.addEventListener('click', async () => {
      if (!activeTaskId) return;
      const title = (modalCopyTitle && modalCopyTitle.value.trim()) || 'Copy of card';
      const targetColumnId = modalCopyColumn && modalCopyColumn.value;
      if (!targetColumnId) return;
      modalCopySubmit.disabled = true;
      try {
        const data = await api(`/tasks/${activeTaskId}/copy`, {
          method: 'POST',
          body: { title, column_id: targetColumnId },
        });
        const newTask = data && data.task;
        if (newTask) {
          taskCache.set(String(newTask.id), newTask);
          const columnsEl = getColumnsEl();
          const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${targetColumnId}"]`);
          if (colEl) {
            const dropZone = colEl.querySelector('.kanban-drop-zone');
            const placeholder = dropZone && dropZone.querySelector('.empty-placeholder, p.italic');
            if (placeholder) placeholder.remove();
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderTaskCard(newTask);
            const cardEl = wrapper.firstElementChild;
            if (dropZone && cardEl) {
              dropZone.appendChild(cardEl);
              if (attachSingleCardEvents) attachSingleCardEvents(cardEl);
              if (attachSingleCardDrag) attachSingleCardDrag(cardEl);
              if (updateColumnBadge) updateColumnBadge(colEl);
            }
          }
        }
        closeMoreMenu();
        if (showToast) showToast('Card copied', 'check');
      } catch (err) {
        console.error('copy failed:', err);
        if (showToast) showToast('Could not copy card', 'error');
      } finally {
        modalCopySubmit.disabled = false;
      }
    });
  }

  // Share dialog — copy link button
  if (modalShareCopy) {
    modalShareCopy.addEventListener('click', async () => {
      if (!modalShareUrl) return;
      const url = modalShareUrl.value;
      try {
        await navigator.clipboard.writeText(url);
        if (modalShareFeedback) modalShareFeedback.classList.remove('hidden');
        setTimeout(() => modalShareFeedback && modalShareFeedback.classList.add('hidden'), 2000);
      } catch (err) {
        modalShareUrl.select();
        try { document.execCommand('copy'); if (modalShareFeedback) modalShareFeedback.classList.remove('hidden'); } catch (e) {}
      }
    });
  }

  // Move menu — pick a column
  if (modalMoveList) {
    modalMoveList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-column-id]');
      if (!btn || !activeTaskId) return;
      const newColumnId = btn.dataset.columnId;
      const task = taskCache.get(activeTaskId);
      if (!task || String(task.column_id) === String(newColumnId)) {
        closeMoreMenu();
        return;
      }
      closeMoreMenu();
      try {
        await api(`/tasks/${activeTaskId}`, { method: 'PUT', body: { column_id: newColumnId } });
        // update cache
        task.column_id = newColumnId;
        // move DOM card
        const columnsEl = getColumnsEl();
        const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
        const targetCol = columnsEl.querySelector(`.kanban-column[data-column-id="${newColumnId}"]`);
        const dropZone = targetCol ? targetCol.querySelector('.kanban-drop-zone') : null;
        if (card && dropZone) {
          const oldCol = card.closest('.kanban-column');
          dropZone.appendChild(card);
          if (updateColumnBadge) {
            if (oldCol) updateColumnBadge(oldCol);
            updateColumnBadge(targetCol);
          }
          // update breadcrumb status in modal
          const colTitle = targetCol.querySelector('h3');
          if (modalStatus && colTitle) modalStatus.textContent = colTitle.textContent.trim();
        }
        if (showToast) showToast('Task moved', 'check');
      } catch (err) {
        console.error('Failed to move task:', err);
        alert('Move failed: ' + (err.message || 'Unknown error'));
      }
    });
  }

  // ─────────────────────────────────────────────
  // Save / Delete task
  // ─────────────────────────────────────────────
  modalSaveBtn.addEventListener('click', async () => {
    const newTitle = modalTitle.value.trim();
    // Prefer Quill HTML if description is in edit mode, else fall back to textarea/cached value
    let newDesc;
    if (window._pawtryIsDescEditing && window._pawtryIsDescEditing()) {
      // get Quill html
      const qBody = document.querySelector('#modal-desc-quill .ql-editor');
      let html = qBody ? qBody.innerHTML : '';
      if (html === '<p><br></p>') html = '';
      newDesc = html;
    } else if (modalDescBody && modalDescBody.innerHTML) {
      newDesc = modalDescBody.innerHTML;
    } else {
      newDesc = modalDesc.value.trim();
    }

    if (!newTitle) { alert('Title is required'); modalTitle.focus(); return; }

    modalSaveBtn.disabled = true;
    modalSaveBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">progress_activity</span> Saving...';

    try {
      if (modalMode === 'create') {
        const data = await api('/tasks', { method: 'POST', body: { column_id: activeColumnId, title: newTitle, description: newDesc } });
        const task = data.task;
        taskCache.set(String(task.id), task);
        const columnsEl = getColumnsEl();
        const colEl = columnsEl.querySelector(`.kanban-column[data-column-id="${activeColumnId}"]`);
        if (colEl) {
          const dropZone = colEl.querySelector('.kanban-drop-zone');
          const placeholder = dropZone.querySelector('.empty-placeholder, p.italic');
          if (placeholder) placeholder.remove();
          const wrapper = document.createElement('div');
          wrapper.innerHTML = renderTaskCard(task);
          const cardEl = wrapper.firstElementChild;
          dropZone.appendChild(cardEl);
          attachSingleCardEvents(cardEl);
          attachSingleCardDrag(cardEl);
          if (updateColumnBadge) updateColumnBadge(colEl);
        }
      } else {
        if (!activeTaskId) return;
        await api(`/tasks/${activeTaskId}`, { method: 'PUT', body: { title: newTitle, description: newDesc } });
        const columnsEl = getColumnsEl();
        const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
        if (card) {
          const h4 = card.querySelector('h4');
          if (h4) h4.textContent = newTitle;
          const descP = card.querySelector('p.text-xs.text-on-surface-variant');
          if (newDesc) {
            if (descP) { descP.textContent = newDesc; }
            else {
              const newP = document.createElement('p');
              newP.className = 'text-xs text-on-surface-variant mb-3 line-clamp-2';
              newP.textContent = newDesc;
              h4.insertAdjacentElement('afterend', newP);
            }
          } else if (descP) { descP.remove(); }
        }
        const cached = taskCache.get(activeTaskId);
        if (cached) { cached.title = newTitle; cached.description = newDesc; }
      }
      closeTaskModal();
    } catch (err) {
      console.error('Failed to save task:', err);
      alert((modalMode === 'create' ? 'Create' : 'Update') + ' failed: ' + (err.message || 'Unknown error'));
    } finally {
      modalSaveBtn.disabled = false;
      modalSaveBtn.innerHTML = modalMode === 'create'
        ? '<span class="material-symbols-outlined text-base">add_task</span> Create Task'
        : '<span class="material-symbols-outlined text-base">save</span> Save Changes';
    }
  });

  if (modalDeleteBtn) {
    modalDeleteBtn.addEventListener('click', async () => {
      if (!activeTaskId) return;
      if (!confirm('Are you sure you want to delete this task?')) return;
      modalDeleteBtn.disabled = true;
      modalDeleteBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">progress_activity</span>';
      try {
        await api(`/tasks/${activeTaskId}`, { method: 'DELETE' });
        const columnsEl = getColumnsEl();
        const card = columnsEl.querySelector(`.task-card[data-task-id="${activeTaskId}"]`);
        if (card) {
          const columnEl = card.closest('.kanban-column');
          card.remove();
          if (columnEl && updateColumnBadge) updateColumnBadge(columnEl);
        }
        taskCache.delete(activeTaskId);
        closeTaskModal();
      } catch (err) {
        console.error('Failed to delete task:', err);
        alert('Delete failed: ' + (err.message || 'Unknown error'));
      } finally {
        modalDeleteBtn.disabled = false;
        modalDeleteBtn.innerHTML = '<span class="material-symbols-outlined text-base">delete</span>Delete';
      }
    });
  }

  // ─────────────────────────────────────────────
  // Attachments
  // ─────────────────────────────────────────────
  function attachmentIsImage(a) { return !!(a && a.mimetype && a.mimetype.startsWith('image/')); }
  function attachmentIsVideo(a) { return !!(a && a.mimetype && a.mimetype.startsWith('video/')); }

  function attachmentDisplayName(a) {
    if (!a) return '';
    const raw = a.filename_or_url || '';
    if (/^https?:\/\//i.test(raw)) {
      try { const u = new URL(raw); return u.hostname + (u.pathname && u.pathname !== '/' ? u.pathname : ''); }
      catch (_) { return raw; }
    }
    const parts = raw.split('/');
    return parts[parts.length - 1] || raw;
  }

  function attachmentSourceLabel(a) {
    if (!a) return '';
    if (a.source === 'direct_upload' && /^https?:\/\//i.test(a.filename_or_url || '')) return 'Link';
    if (a.source === 'direct_upload') return 'Upload';
    return a.source || 'Attachment';
  }

  function attachmentHref(a) {
    if (!a) return '#';
    return coverSrc ? coverSrc(a.filename_or_url || '') : (a.filename_or_url || '');
  }

  function renderAttachments(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (!modalAttachmentsList) return;
    if (!list.length) {
      modalAttachmentsList.innerHTML = '';
      if (modalAttachmentsEmpty) modalAttachmentsEmpty.classList.remove('hidden');
      return;
    }
    if (modalAttachmentsEmpty) modalAttachmentsEmpty.classList.add('hidden');
    modalAttachmentsList.innerHTML = list.map(a => {
      const isImg   = attachmentIsImage(a);
      const isVideo = attachmentIsVideo(a);
      const href    = attachmentHref(a);
      const name    = escapeHtml(attachmentDisplayName(a));
      const source  = escapeHtml(attachmentSourceLabel(a));
      const thumb = isImg
        ? `<img src="${escapeHtml(href)}" alt="" class="w-full h-full object-cover"/>`
        : isVideo
        ? `<video src="${escapeHtml(href)}" class="w-full h-full object-cover" muted playsinline preload="metadata"></video>`
        : `<span class="material-symbols-outlined text-gray-400">${/^https?:\/\//i.test(a.filename_or_url || '') ? 'link' : 'description'}</span>`;
      const makeCoverBtn = isImg
        ? `<button type="button" data-att-action="cover" data-att-id="${escapeHtml(String(a.id))}" class="text-[11px] font-semibold text-indigo-600 hover:underline">${a.is_cover ? 'Cover ✓' : 'Make cover'}</button>`
        : '';
      return `
        <li class="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-2">
          <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="w-16 h-16 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">${thumb}</a>
          <div class="flex-1 min-w-0">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="block text-sm font-semibold text-gray-700 truncate hover:underline">${name}</a>
            <div class="mt-0.5 text-[11px] text-gray-400">${source}</div>
            <div class="mt-1 flex items-center gap-3">
              ${makeCoverBtn}
              <button type="button" data-att-action="delete" data-att-id="${escapeHtml(String(a.id))}" class="text-[11px] font-semibold text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        </li>
      `;
    }).join('');
  }

  function syncCachedAttachments(next) {
    if (!activeTaskId) return;
    const cached = taskCache.get(activeTaskId);
    if (cached) cached.attachments = next;
  }

  async function refreshAttachmentsFromServer() {
    if (!activeTaskId) return;
    try {
      const data = await api(`/tasks/${activeTaskId}/attachments`);
      const list = (data && data.attachments) || [];
      syncCachedAttachments(list);
      renderAttachments(list);
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('fetch attachments failed:', err);
    }
  }

  async function uploadAttachmentFile(file) {
    if (!activeTaskId || !file) return;
    try {
      const data = await uploadTaskAttachment(activeTaskId, file);
      const attachment = data && data.attachment;
      if (attachment) {
        const cached = taskCache.get(activeTaskId);
        const list = (cached && Array.isArray(cached.attachments)) ? cached.attachments.slice() : [];
        list.unshift(attachment);
        syncCachedAttachments(list);
        renderAttachments(list);
      }
      if (showToast) showToast('File uploaded', 'attach_file');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('upload attachment failed:', err);
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    }
  }

  async function addLinkAttachment(url) {
    if (!activeTaskId || !url) return;
    try {
      const data = await api(`/tasks/${activeTaskId}/attachments/link`, { method: 'POST', body: { url } });
      const attachment = data && data.attachment;
      if (attachment) {
        const cached = taskCache.get(activeTaskId);
        const list = (cached && Array.isArray(cached.attachments)) ? cached.attachments.slice() : [];
        if (!list.some(a => String(a.id) === String(attachment.id))) list.unshift(attachment);
        syncCachedAttachments(list);
        renderAttachments(list);
      }
      if (showToast) showToast('Link attached', 'link');
    } catch (err) {
      if (err.message === 'Unauthorized') return;
      console.error('add link attachment failed:', err);
      alert('Could not attach link: ' + (err.message || 'Unknown error'));
    }
  }

  if (popupAttachmentFile) {
    popupAttachmentFile.addEventListener('change', async () => {
      const files = Array.from(popupAttachmentFile.files || []);
      if (!files.length) return;
      popupAttachmentFile.disabled = true;
      try { for (const f of files) await uploadAttachmentFile(f); }
      finally {
        popupAttachmentFile.value = '';
        popupAttachmentFile.disabled = false;
        if (popupAttachments) popupAttachments.classList.add('hidden');
      }
    });
  }

  if (popupAttachmentSubmit) {
    popupAttachmentSubmit.addEventListener('click', async () => {
      const raw = (popupAttachmentUrl && popupAttachmentUrl.value || '').trim();
      if (!raw) { alert('Please paste a link first.'); if (popupAttachmentUrl) popupAttachmentUrl.focus(); return; }
      if (!/^https?:\/\//i.test(raw)) { alert('Link must start with http:// or https://'); return; }
      popupAttachmentSubmit.disabled = true;
      try {
        await addLinkAttachment(raw);
        if (popupAttachmentUrl) popupAttachmentUrl.value = '';
        if (popupAttachments) popupAttachments.classList.add('hidden');
      } finally { popupAttachmentSubmit.disabled = false; }
    });
  }

  if (modalAttachmentsList) {
    modalAttachmentsList.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-att-action]');
      if (!btn || !activeTaskId) return;
      const action = btn.dataset.attAction;
      const attId  = btn.dataset.attId;
      if (!attId) return;
      btn.disabled = true;
      try {
        if (action === 'delete') {
          if (!confirm('Delete this attachment?')) { btn.disabled = false; return; }
          await api(`/attachments/${attId}`, { method: 'DELETE' });
          const cached = taskCache.get(activeTaskId);
          const list = (cached && Array.isArray(cached.attachments)) ? cached.attachments.filter(a => String(a.id) !== String(attId)) : [];
          syncCachedAttachments(list);
          renderAttachments(list);
        } else if (action === 'cover') {
          await api(`/attachments/${attId}/set_cover`, { method: 'PUT' });
          const cached = taskCache.get(activeTaskId);
          if (cached && Array.isArray(cached.attachments)) {
            cached.attachments = cached.attachments.map(a => ({ ...a, is_cover: String(a.id) === String(attId) }));
            renderAttachments(cached.attachments);
          }
          if (D.getActiveBoardId && D.loadBoardData) { const bid = D.getActiveBoardId(); if (bid) D.loadBoardData(bid); }
        }
      } catch (err) {
        if (err.message === 'Unauthorized') return;
        console.error('attachment action failed:', err);
        alert((action === 'delete' ? 'Delete' : 'Set cover') + ' failed: ' + (err.message || 'Unknown error'));
      } finally { btn.disabled = false; }
    });
  }

  (function setupModalFileDrop() {
    if (!modalPanel) return;
    let depth = 0;
    modalPanel.addEventListener('dragenter', (e) => { if (!hasFilesPayload(e.dataTransfer)) return; e.preventDefault(); depth++; modalPanel.classList.add('is-dragover'); });
    modalPanel.addEventListener('dragover',  (e) => { if (!hasFilesPayload(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    modalPanel.addEventListener('dragleave', (e) => { if (!hasFilesPayload(e.dataTransfer)) return; depth--; if (depth <= 0) { depth = 0; modalPanel.classList.remove('is-dragover'); } });
    modalPanel.addEventListener('drop', async (e) => {
      if (!hasFilesPayload(e.dataTransfer)) return;
      e.preventDefault(); depth = 0; modalPanel.classList.remove('is-dragover');
      if (!activeTaskId) { alert('Save the task first, then drop files on it.'); return; }
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      for (const f of files) await uploadAttachmentFile(f);
    });
  })();

  window.Dashboard.renderAttachments    = renderAttachments;
  window.Dashboard.uploadAttachmentFile = uploadAttachmentFile;
  window.Dashboard.addLinkAttachment    = addLinkAttachment;
  window.Dashboard.openTaskModal        = openTaskModal;
  window.Dashboard.openCreateModal      = openCreateModal;
  window.Dashboard.closeTaskModal       = closeTaskModal;
})();
