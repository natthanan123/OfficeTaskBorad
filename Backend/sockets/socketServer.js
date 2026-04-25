const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

function setupSocketServer(server, app) {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  app.set('io', io);

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      return next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  // Connection handlers
  io.on('connection', (socket) => {
    console.log(`⚡ Socket connected: ${socket.id} (user ${socket.user && socket.user.id})`);

    let currentBoardRoom = null;

    socket.on('join_user_room', (userId) => {
      if (!userId) return;
      const room = `user_${userId}`;
      socket.join(room);
      console.log(`   ↳ ${socket.id} joined ${room}`);
    });

    socket.on('join_board_room', (boardId) => {
      if (!boardId) return;
      const room = `board_${boardId}`;
      if (currentBoardRoom && currentBoardRoom !== room) {
        socket.leave(currentBoardRoom);
        console.log(`   ↳ ${socket.id} left ${currentBoardRoom}`);
      }
      currentBoardRoom = room;
      socket.join(room);
      console.log(`   ↳ ${socket.id} joined ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`⚡ Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = setupSocketServer;
