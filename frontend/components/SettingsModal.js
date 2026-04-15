(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[SettingsModal] window.Dashboard is missing — script order?');
    return;
  }

  const API_ORIGIN = 'http://localhost:3000';
  const API_BASE   = `${API_ORIGIN}/api`;

  const api       = D.api;
  const showToast = D.showToast;
  const state     = D.state;

  const settingsBtn     = document.getElementById('settings-btn');
  const mainContainerEl = document.getElementById('board-main-container');
  const userMenuImg     = document.querySelector('#user-menu img');

  if (!settingsBtn || !mainContainerEl) {
    console.error('[SettingsModal] Required DOM elements are missing.');
    return;
  }

  const modalRoot = document.createElement('div');
  modalRoot.id = 'settings-modal';
  modalRoot.className = 'fixed inset-0 z-[110] hidden';
  modalRoot.innerHTML = `
    <div id="settings-backdrop" class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div id="settings-panel"
           class="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">
        <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-on-surface-variant">settings</span>
            <h3 class="text-lg font-bold text-on-surface">Settings</h3>
          </div>
          <button id="settings-close" type="button"
                  class="text-on-surface-variant/60 hover:text-on-surface transition-colors">
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <div class="flex flex-1 min-h-0">
          <aside class="w-56 flex-shrink-0 border-r border-outline-variant/20 bg-surface-container-low p-3 space-y-1">
            <button type="button" data-tab="profile"
                    class="settings-tab-btn w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors">
              <span class="material-symbols-outlined text-base">person</span>
              <span>My Profile</span>
            </button>
            <button type="button" data-tab="background"
                    class="settings-tab-btn w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors">
              <span class="material-symbols-outlined text-base">wallpaper</span>
              <span>Board Background</span>
            </button>
          </aside>

          <div class="flex-1 min-w-0 overflow-y-auto p-8">

            <section id="settings-tab-profile" class="space-y-6">
              <div>
                <h4 class="text-base font-bold text-on-surface">My Profile</h4>
                <p class="text-xs text-on-surface-variant mt-1">Update your profile picture. It will be visible across all boards.</p>
              </div>

              <div class="flex items-center gap-5">
                <div class="relative w-24 h-24 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant/30 flex items-center justify-center">
                  <img id="settings-profile-preview" alt="Profile preview"
                       class="w-full h-full object-cover hidden"/>
                  <span id="settings-profile-placeholder"
                        class="material-symbols-outlined text-[42px] text-on-surface-variant/50">person</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p id="settings-profile-name" class="text-sm font-semibold text-on-surface truncate">Loading...</p>
                  <p id="settings-profile-email" class="text-xs text-on-surface-variant truncate">—</p>
                </div>
              </div>

              <div class="space-y-3">
                <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Upload new picture</label>
                <input id="settings-profile-file" type="file" accept="image/*"
                       class="w-full text-xs text-on-surface file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary-container file:text-on-primary hover:file:opacity-90 cursor-pointer"/>
                <p id="settings-profile-hint" class="text-[11px] text-on-surface-variant/60 italic">PNG, JPG or GIF up to 5MB.</p>
              </div>

              <div class="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button id="settings-profile-save" type="button"
                        class="bg-primary text-on-primary font-semibold px-5 py-2 rounded-lg text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  Save Picture
                </button>
              </div>
            </section>

            <section id="settings-tab-background" class="space-y-6 hidden">
              <div>
                <h4 class="text-base font-bold text-on-surface">Board Background</h4>
                <p class="text-xs text-on-surface-variant mt-1">Personalize how this board looks. Only the board creator can make changes.</p>
              </div>

              <div id="settings-bg-locked"
                   class="hidden p-4 rounded-xl bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface-variant flex items-center gap-2">
                <span class="material-symbols-outlined text-base text-on-surface-variant">lock</span>
                <span>Only the board creator can change the background.</span>
              </div>

              <div id="settings-bg-editor" class="space-y-6">

                <div>
                  <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Pick a color</label>
                  <div id="settings-bg-swatches" class="flex flex-wrap gap-2"></div>
                  <div class="mt-3 flex items-center gap-2">
                    <input id="settings-bg-color-input" type="color" value="#3525cd"
                           class="h-9 w-12 rounded-md border border-outline-variant/40 bg-surface-container-low cursor-pointer"/>
                    <span class="text-[11px] text-on-surface-variant">Or pick a custom color</span>
                  </div>
                </div>

                <div class="space-y-3">
                  <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Upload background image</label>
                  <input id="settings-bg-file" type="file" accept="image/*"
                         class="w-full text-xs text-on-surface file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary-container file:text-on-primary hover:file:opacity-90 cursor-pointer"/>
                  <p class="text-[11px] text-on-surface-variant/60 italic">Uploading an image will override the selected color.</p>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Preview</label>
                  <div id="settings-bg-preview"
                       class="h-28 rounded-xl border border-outline-variant/30 bg-surface-container-high"></div>
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
                  <button id="settings-bg-clear" type="button"
                          class="bg-surface-container-high text-on-surface font-semibold px-4 py-2 rounded-lg text-sm hover:bg-surface-container-highest transition-colors">
                    Clear
                  </button>
                  <button id="settings-bg-save" type="button"
                          class="bg-primary text-on-primary font-semibold px-5 py-2 rounded-lg text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    Save Background
                  </button>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  const backdropEl       = modalRoot.querySelector('#settings-backdrop');
  const closeBtn         = modalRoot.querySelector('#settings-close');
  const tabBtns          = modalRoot.querySelectorAll('.settings-tab-btn');
  const tabProfileEl     = modalRoot.querySelector('#settings-tab-profile');
  const tabBackgroundEl  = modalRoot.querySelector('#settings-tab-background');

  const profilePreview     = modalRoot.querySelector('#settings-profile-preview');
  const profilePlaceholder = modalRoot.querySelector('#settings-profile-placeholder');
  const profileNameEl      = modalRoot.querySelector('#settings-profile-name');
  const profileEmailEl     = modalRoot.querySelector('#settings-profile-email');
  const profileFileInput   = modalRoot.querySelector('#settings-profile-file');
  const profileSaveBtn     = modalRoot.querySelector('#settings-profile-save');

  const bgLockedEl   = modalRoot.querySelector('#settings-bg-locked');
  const bgEditorEl   = modalRoot.querySelector('#settings-bg-editor');
  const bgSwatchesEl = modalRoot.querySelector('#settings-bg-swatches');
  const bgColorInput = modalRoot.querySelector('#settings-bg-color-input');
  const bgFileInput  = modalRoot.querySelector('#settings-bg-file');
  const bgPreviewEl  = modalRoot.querySelector('#settings-bg-preview');
  const bgClearBtn   = modalRoot.querySelector('#settings-bg-clear');
  const bgSaveBtn    = modalRoot.querySelector('#settings-bg-save');

  const SWATCH_COLORS = [
    '#3525cd', '#4f46e5', '#0ea5e9', '#14b8a6',
    '#22c55e', '#eab308', '#f97316', '#ef4444',
    '#ec4899', '#8b5cf6', '#64748b', '#0f172a',
  ];

  let currentBackgroundValue = null;

  function resolveBgUrl(value) {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/uploads/')) return `${API_ORIGIN}${value}`;
    return value;
  }

  function applyBoardBackground(bgValue) {
    currentBackgroundValue = bgValue || null;
    if (!bgValue) {
      mainContainerEl.style.backgroundImage = '';
      mainContainerEl.style.backgroundSize = '';
      mainContainerEl.style.backgroundRepeat = '';
      mainContainerEl.style.backgroundPosition = '';
      mainContainerEl.style.backgroundColor = '';
      return;
    }
    if (bgValue.startsWith('/uploads/') || /^https?:\/\//i.test(bgValue)) {
      mainContainerEl.style.backgroundImage = `url(${resolveBgUrl(bgValue)})`;
      mainContainerEl.style.backgroundSize = 'cover';
      mainContainerEl.style.backgroundRepeat = 'no-repeat';
      mainContainerEl.style.backgroundPosition = 'center';
      mainContainerEl.style.backgroundColor = '';
    } else {
      mainContainerEl.style.backgroundImage = '';
      mainContainerEl.style.backgroundSize = '';
      mainContainerEl.style.backgroundRepeat = '';
      mainContainerEl.style.backgroundPosition = '';
      mainContainerEl.style.backgroundColor = bgValue;
    }
  }

  function renderBgPreview(value) {
    if (!value) {
      bgPreviewEl.style.backgroundImage = '';
      bgPreviewEl.style.backgroundColor = '';
      bgPreviewEl.style.backgroundSize = '';
      return;
    }
    if (value.startsWith('blob:') || value.startsWith('data:') || value.startsWith('/uploads/') || /^https?:\/\//i.test(value)) {
      bgPreviewEl.style.backgroundImage = `url(${value.startsWith('/uploads/') ? resolveBgUrl(value) : value})`;
      bgPreviewEl.style.backgroundSize = 'cover';
      bgPreviewEl.style.backgroundRepeat = 'no-repeat';
      bgPreviewEl.style.backgroundPosition = 'center';
      bgPreviewEl.style.backgroundColor = '';
    } else {
      bgPreviewEl.style.backgroundImage = '';
      bgPreviewEl.style.backgroundColor = value;
    }
  }

  function renderBgSwatches() {
    bgSwatchesEl.innerHTML = SWATCH_COLORS.map(c => `
      <button type="button" data-color="${c}" aria-label="${c}"
              class="settings-bg-swatch h-8 w-8 rounded-md border border-outline-variant/30 transition-transform hover:scale-105"
              style="background:${c}"></button>
    `).join('');
    bgSwatchesEl.querySelectorAll('.settings-bg-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.color;
        bgColorInput.value = c;
        pendingBgFile = null;
        bgFileInput.value = '';
        renderBgPreview(c);
      });
    });
  }

  let pendingBgFile = null;
  let pendingProfileFile = null;

  function getActiveBoard() {
    const id = state.activeBoardId;
    if (!id) return null;
    return state.cachedBoards.find(b => String(b.id) === String(id)) || null;
  }

  function isBoardCreator() {
    const board = getActiveBoard();
    if (!board) return false;
    if (state.currentUserId == null) return false;
    return String(board.creator_id) === String(state.currentUserId);
  }

  async function refreshProfileTab() {
    profileNameEl.textContent  = 'Loading...';
    profileEmailEl.textContent = '—';
    profilePreview.src = '';
    profilePreview.classList.add('hidden');
    profilePlaceholder.classList.remove('hidden');
    pendingProfileFile = null;
    profileFileInput.value = '';
    try {
      const data = await api('/users/me');
      const user = data && data.user;
      if (!user) return;
      profileNameEl.textContent  = user.full_name || '—';
      profileEmailEl.textContent = user.email || '';
      const src = user.profile_picture || user.avatar_url || '';
      if (src) {
        profilePreview.src = resolveBgUrl(src);
        profilePreview.classList.remove('hidden');
        profilePlaceholder.classList.add('hidden');
      }
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        console.error('[SettingsModal] fetch /users/me failed:', err);
      }
    }
  }

  function refreshBackgroundTab() {
    pendingBgFile = null;
    bgFileInput.value = '';

    if (!isBoardCreator()) {
      bgLockedEl.classList.remove('hidden');
      bgEditorEl.classList.add('hidden');
      return;
    }
    bgLockedEl.classList.add('hidden');
    bgEditorEl.classList.remove('hidden');

    const board = getActiveBoard();
    const bg = (board && board.background) || currentBackgroundValue || '';
    if (bg && !bg.startsWith('/uploads/') && !/^https?:\/\//i.test(bg)) {
      bgColorInput.value = /^#[0-9a-f]{6}$/i.test(bg) ? bg : '#3525cd';
    } else {
      bgColorInput.value = '#3525cd';
    }
    renderBgPreview(bg);
  }

  function setActiveTab(tab) {
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('bg-primary-container', on);
      btn.classList.toggle('text-on-primary', on);
      btn.classList.toggle('font-semibold', on);
    });
    tabProfileEl.classList.toggle('hidden', tab !== 'profile');
    tabBackgroundEl.classList.toggle('hidden', tab !== 'background');
    if (tab === 'profile') refreshProfileTab();
    if (tab === 'background') refreshBackgroundTab();
  }

  function openModal(tab = 'profile') {
    modalRoot.classList.remove('hidden');
    setActiveTab(tab);
  }

  function closeModal() {
    modalRoot.classList.add('hidden');
  }

  settingsBtn.addEventListener('click', () => openModal('profile'));
  closeBtn.addEventListener('click', closeModal);
  backdropEl.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalRoot.classList.contains('hidden')) closeModal();
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  profileFileInput.addEventListener('change', () => {
    const file = profileFileInput.files && profileFileInput.files[0];
    pendingProfileFile = file || null;
    if (file) {
      const objUrl = URL.createObjectURL(file);
      profilePreview.src = objUrl;
      profilePreview.classList.remove('hidden');
      profilePlaceholder.classList.add('hidden');
    }
  });

  profileSaveBtn.addEventListener('click', async () => {
    if (!pendingProfileFile) {
      if (showToast) showToast('Choose a picture first', 'info');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;

    const fd = new FormData();
    fd.append('avatar', pendingProfileFile);

    profileSaveBtn.disabled = true;
    const prevLabel = profileSaveBtn.textContent;
    profileSaveBtn.textContent = 'Uploading...';
    try {
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.replace(D.LOGIN_PAGE);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.status !== 'success') {
        throw new Error(payload.message || `Upload failed (HTTP ${res.status})`);
      }
      const picPath = payload.data && payload.data.profile_picture;
      const resolved = resolveBgUrl(picPath);
      if (userMenuImg && resolved) userMenuImg.src = resolved;
      const sidebarImg = document.getElementById('sidebar-user-avatar');
      if (sidebarImg && resolved) sidebarImg.src = resolved;
      if (resolved) profilePreview.src = resolved;
      pendingProfileFile = null;
      profileFileInput.value = '';
      if (showToast) showToast('Profile picture updated', 'check_circle');

      if (D.loadBoardData && state.activeBoardId) {
        D.loadBoardData(state.activeBoardId);
      }
    } catch (err) {
      console.error('[SettingsModal] avatar upload failed:', err);
      if (showToast) showToast(err.message || 'Could not upload picture', 'error');
    } finally {
      profileSaveBtn.disabled = false;
      profileSaveBtn.textContent = prevLabel;
    }
  });

  bgColorInput.addEventListener('input', () => {
    pendingBgFile = null;
    bgFileInput.value = '';
    renderBgPreview(bgColorInput.value);
  });

  bgFileInput.addEventListener('change', () => {
    const file = bgFileInput.files && bgFileInput.files[0];
    pendingBgFile = file || null;
    if (file) {
      const objUrl = URL.createObjectURL(file);
      renderBgPreview(objUrl);
    }
  });

  bgClearBtn.addEventListener('click', () => {
    pendingBgFile = null;
    bgFileInput.value = '';
    bgColorInput.value = '#3525cd';
    renderBgPreview('');
  });

  bgSaveBtn.addEventListener('click', async () => {
    if (!isBoardCreator()) {
      if (showToast) showToast('Only the board creator can change the background', 'lock');
      return;
    }
    const boardId = state.activeBoardId;
    if (!boardId) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    bgSaveBtn.disabled = true;
    const prevLabel = bgSaveBtn.textContent;
    bgSaveBtn.textContent = 'Saving...';
    try {
      let res;
      if (pendingBgFile) {
        const fd = new FormData();
        fd.append('background_image', pendingBgFile);
        res = await fetch(`${API_BASE}/boards/${boardId}/background`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
      } else {
        const colorValue = bgColorInput.value || '#3525cd';
        res = await fetch(`${API_BASE}/boards/${boardId}/background`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ background: colorValue }),
        });
      }

      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.replace(D.LOGIN_PAGE);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.status !== 'success') {
        throw new Error(payload.message || `Request failed (HTTP ${res.status})`);
      }

      const newBg = payload.data && payload.data.background;
      applyBoardBackground(newBg);

      const board = getActiveBoard();
      if (board) board.background = newBg;

      pendingBgFile = null;
      bgFileInput.value = '';
      renderBgPreview(newBg);
      if (showToast) showToast('Background updated', 'check_circle');
    } catch (err) {
      console.error('[SettingsModal] background update failed:', err);
      if (showToast) showToast(err.message || 'Could not update background', 'error');
    } finally {
      bgSaveBtn.disabled = false;
      bgSaveBtn.textContent = prevLabel;
    }
  });

  renderBgSwatches();

  window.addEventListener('dashboard:board-loaded', () => {
    const board = getActiveBoard();
    const bg = (board && board.background) || null;
    applyBoardBackground(bg);
    if (!modalRoot.classList.contains('hidden') && !tabBackgroundEl.classList.contains('hidden')) {
      refreshBackgroundTab();
    }
  });

  D.openSettingsModal   = openModal;
  D.applyBoardBackground = applyBoardBackground;
})();
