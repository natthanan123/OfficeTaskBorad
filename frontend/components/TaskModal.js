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
      }
    }

    function collapse() {
      if (toolbarEl) toolbarEl.classList.remove('is-visible');
      if (editorRoot) editorRoot.style.minHeight = '38px';
      if (actionBar) actionBar.style.display = 'none';
    }
    function expand() {
      if (toolbarEl) toolbarEl.classList.add('is-visible');
      if (editorRoot) editorRoot.style.minHeight = '100px';
      if (actionBar) actionBar.style.display = 'flex';
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

    if (D.attachMentionSupport) D.attachMentionSupport(quillEditor);
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
      if (D.attachMentionSupport) D.attachMentionSupport(descQuill);

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
    md = md.replace(/&nbsp;/g, ' ')
           .replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"');
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function toggleMarkdownView(q) {
    const mdPre  = document.getElementById('modal-desc-markdown');
    const qEl    = document.getElementById('modal-desc-quill');
    const btn    = document.querySelector('[data-desc-action="markdown"]');
    if (!mdPre || !qEl) return;

    if (mdPre.classList.contains('hidden')) {
      const html = q.root.innerHTML;
      mdPre.textContent = htmlToMarkdown(html);
      mdPre.classList.remove('hidden');
      qEl.style.display = 'none';
      if (btn) btn.classList.add('is-active');
    } else {
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
    const cached = activeTaskId && taskCache.get(activeTaskId);
    if (cached) setDescriptionView(cached.description || '');
  }

  async function saveDescription() {
    if (!descQuill) return;
    let html = descQuill.root.innerHTML;
    if (html === '<p><br></p>') html = '';

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
    exitDescEditMode();
  }

  if (modalDescEditBtn) modalDescEditBtn.addEventListener('click', enterDescEditMode);
  if (modalDescEmptyBtn) modalDescEmptyBtn.addEventListener('click', enterDescEditMode);
  if (modalDescBody) modalDescBody.addEventListener('click', (e) => {
    if (e.target.closest('a, img')) return;
    enterDescEditMode();
  });
  if (modalDescSaveBtn) modalDescSaveBtn.addEventListener('click', saveDescription);
  if (modalDescCancelBtn) modalDescCancelBtn.addEventListener('click', cancelDescEdit);

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

      const wrapper = document.createElement('div');
      wrapper.innerHTML = D.renderCommentItem(comment);
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

  async function autosaveOpenEdits(clickTarget) {
    const editors = modalCommentsList.querySelectorAll('[data-comment-editor]');
    for (const ed of editors) {
      if (clickTarget && ed.contains(clickTarget)) continue;
      const commentId = ed.dataset.commentEditor;
      const ta = ed.querySelector('textarea');
      if (!ta) continue;
      const newText = ta.value.trim();
      const origText = (ed.dataset.originalText || '').trim();

      if (!newText) {
        exitEditMode(commentId);
        continue;
      }
      if (newText === origText) {
        exitEditMode(commentId);
        continue;
      }
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
      try {
        await submitReply(commentId);
      } catch (err) {
        console.error('[autosave-reply] failed:', err);
      }
    }
  }

  (function wireGlobalAutosave() {
    document.addEventListener('mousedown', (e) => {
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
        target.closest('.pawtry-desc-toolbar') ||
        target.closest('#modal-desc-edit') ||
        target.closest('[data-comment-editor]') ||
        target.closest('[data-edit-save]') ||
        target.closest('[data-edit-cancel]')
      );

      if (quillEditor && !skipMain) {
        const content = getQuillContent();
        if (content && content !== '<p><br></p>') {
          submitCommentFn().catch(err => console.error('[autosave-main] failed:', err));
        }
      }

      const skipEditTriggers = (
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu') ||
        target.closest('[data-edit-save]') ||
        target.closest('[data-edit-cancel]')
      );
      if (!skipEditTriggers) {
        autosaveOpenEdits(target);
      }

      // ── 3. Reply form autosave ──
      const skipReplyTriggers = (
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu') ||
        target.closest('[data-reply-send]') ||
        target.closest('[data-reply-cancel]')
      );
      if (!skipReplyTriggers) {
        autosaveOpenReplies(target);
      }

      // ── 4. Description edit mode autosave ──
      const skipDescTriggers = (
        target.closest('#modal-desc-edit') ||
        target.closest('#modal-desc-edit-btn') ||
        target.closest('#modal-desc-save-btn') ||
        target.closest('#modal-desc-cancel-btn') ||
        target.closest('.pawtry-popup') ||
        target.closest('#pawtry-mention-menu')
      );
      if (!skipDescTriggers && window._pawtryIsDescEditing && window._pawtryIsDescEditing()) {
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

  // Reactions live-refresh
  function refreshReactionsRow(commentId, reactions) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const row = item.querySelector('.pawtry-reactions-row');
    if (!row) return;
    const fake = { id: commentId, reactions: reactions || [] };
    const newHtml = D.renderReactionsRow(fake);
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
    const emojiPopup = document.getElementById('pawtry-emoji-popup');
    if (!emojiPopup) {
      console.error('[openReactionPicker] pawtry-emoji-popup not found!');
      return;
    }
    document.querySelectorAll('.pawtry-popup').forEach(p => p.classList.remove('is-open'));

    reactionPickerForCommentId = commentId;
    const rect = anchorBtn.getBoundingClientRect();
    emojiPopup.style.top = `${rect.bottom + 4}px`;
    emojiPopup.style.left = `${rect.left}px`;
    const vw = window.innerWidth;
    const pw = emojiPopup.offsetWidth || 340;
    if (rect.left + pw > vw - 16) {
      emojiPopup.style.left = `${Math.max(8, vw - pw - 16)}px`;
    }
    emojiPopup.classList.add('is-open');
  }

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
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        ev.preventDefault();
        toggleReaction(commentId, ev.detail.unicode);
      }
    }, true);
  })();

  // ─────────────────────────────────────────────
  // Reply form
  // ─────────────────────────────────────────────
  const replyQuills = new Map();

  function showReplyForm(commentId) {
    const item = modalCommentsList.querySelector(`[data-comment-item="${commentId}"]`);
    if (!item) return;
    const existing = item.querySelector('.pawtry-reply-form');
    if (existing) {
      replyQuills.delete(commentId);
      existing.remove();
      return;
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

    const editorDiv = form.querySelector(`[data-reply-editor="${commentId}"]`);
    if (editorDiv && typeof Quill !== 'undefined') {
      try {
        const replyQuill = new Quill(editorDiv, {
          theme: 'snow',
          placeholder: 'Write a reply...',
          modules: { toolbar: false },
        });
        replyQuills.set(commentId, replyQuill);

        if (D.attachMentionSupport) D.attachMentionSupport(replyQuill);

        wireReplyToolbar(commentId, replyQuill, form);

        replyQuill.on('selection-change', () => updateReplyToolbarActive(commentId, replyQuill));
        replyQuill.on('text-change', () => updateReplyToolbarActive(commentId, replyQuill));

        const parent = getCachedComment(commentId);
        if (parent && parent.author && parent.author.id) {
          const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
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
        if (searchInput) searchInput.dispatchEvent(new Event('input'));
        insertMenu.classList.add('is-open');
        positionPopup(insertMenu, btn);
        if (searchInput) setTimeout(() => searchInput.focus(), 30);
      } else if (action === 'mention') {
        const sel = replyQuill.getSelection(true) || { index: replyQuill.getLength(), length: 0 };
        replyQuill.insertText(sel.index, '@', Quill.sources.USER);
        replyQuill.setSelection(sel.index + 1, Quill.sources.SILENT);
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

      const parentDepth = parseInt(item.dataset.commentDepth || '0', 10);
      const replyDepth = Math.min(parentDepth + 1, 2);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = D.renderCommentItem(comment, replyDepth);
      const li = wrapper.firstElementChild;
      if (li) {
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

  // Mention system lives in TaskMentions.js

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
    if (content.startsWith('<')) {
      const tmp = document.createElement('div');
      tmp.innerHTML = content;
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
    editor.dataset.originalText = editableText;
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
      if (body) body.innerHTML = D.renderCommentContent(newContentHtml);
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
      ? D.renderCommentThread(comments)
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
    modalSaveBtn.classList.remove('hidden');
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
    modalSaveBtn.classList.remove('hidden');
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

  // More actions dropdown lives in TaskModalActions.js

  // ─────────────────────────────────────────────
  // Save / Delete task
  // ─────────────────────────────────────────────
  modalSaveBtn.addEventListener('click', async () => {
    const newTitle = modalTitle.value.trim();
    let newDesc;
    if (window._pawtryIsDescEditing && window._pawtryIsDescEditing()) {
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
  window.Dashboard.renderAssignees      = refreshAssigneesDisplay;

  // TaskModal public handle
  window.Dashboard.TaskModal = {
    getActiveTaskId:   () => activeTaskId,
    getActiveColumnId: () => activeColumnId,
    close: closeTaskModal,
  };
})();
