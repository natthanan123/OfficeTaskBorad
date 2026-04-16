
(function () {
  const D = window.Dashboard;
  if (!D) {
    console.error('[SocketManager] window.Dashboard is missing — script order?');
    return;
  }

  if (typeof io !== 'function') {
    console.error('[SocketManager] socket.io client not loaded — real-time disabled.');
    window.Dashboard.SocketManager = {
      joinUserRoom:  () => {},
      joinBoardRoom: () => {},
      getSocket:     () => null,
    };
    return;
  }

  const token = localStorage.getItem('token');

  const socket = io(window.APP_CONFIG.API_ORIGIN, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  let boardUpdateDebounce = null;

  socket.on('connect', () => {
    console.log('[socket] connected', socket.id);
    const currentUserId = D.getCurrentUserId && D.getCurrentUserId();
    const activeBoardId = D.getActiveBoardId && D.getActiveBoardId();
    if (currentUserId) socket.emit('join_user_room', currentUserId);
    if (activeBoardId) socket.emit('join_board_room', activeBoardId);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] connect_error:', err && err.message);
    if (err && err.message === 'Authentication error') {
      alert('Your session has expired. Please log in again.');
      localStorage.removeItem('token');
      if (D.LOGIN_PAGE) window.location.replace(D.LOGIN_PAGE);
    }
  });

  socket.on('new_notification', () => {
    if (D.fetchNotifications) D.fetchNotifications();
    if (D.showToast) D.showToast('You have a new notification', 'notifications_active');
  });

  socket.on('board_updated', (payload) => {
    const activeBoardId = D.getActiveBoardId && D.getActiveBoardId();
    if (!activeBoardId) return;
    if (payload && payload.board_id && String(payload.board_id) !== String(activeBoardId)) return;

    clearTimeout(boardUpdateDebounce);
    boardUpdateDebounce = setTimeout(() => {
      if (D.loadBoardData) D.loadBoardData(activeBoardId);
    }, 200);
  });

  function joinUserRoom(userId) {
    if (!userId) return;
    if (socket.connected) socket.emit('join_user_room', userId);
  }

  function joinBoardRoom(boardId) {
    if (!boardId) return;
    if (socket.connected) socket.emit('join_board_room', boardId);
  }

  window.Dashboard.SocketManager = {
    joinUserRoom,
    joinBoardRoom,
    getSocket: () => socket,
  };
})();
