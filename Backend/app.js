require('dotenv').config();

const express = require('express');
const http    = require('http');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const { Server } = require('socket.io');
const { sequelize } = require('./models');

const app    = express();
const server = http.createServer(app);

// ─── Socket.io setup ───
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Store io so controllers can access it via req.app.get('io')
app.set('io', io);

// ─── Socket.io JWT auth middleware ───
// Runs before every `io.on('connection')`. Rejects handshakes that don't
// carry a valid JWT in `socket.handshake.auth.token`, and attaches the
// decoded payload to `socket.user` for downstream handlers.
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

io.on('connection', (socket) => {
  console.log(`⚡ Socket connected: ${socket.id} (user ${socket.user && socket.user.id})`);

  // Track the current board room per socket so we can leave it cleanly
  // when the user switches boards. One socket watches one board at a time.
  let currentBoardRoom = null;

  // ── join_user_room ── join a private room for this user's notifications
  //    Client emits right after fetching /users/me.
  socket.on('join_user_room', (userId) => {
    if (!userId) return;
    const room = `user_${userId}`;
    socket.join(room);
    console.log(`   ↳ ${socket.id} joined ${room}`);
  });

  // ── join_board_room ── join a board's live-update room
  //    Client emits on initial board load and whenever the user switches boards.
  //    We auto-leave the previously joined board room to keep the socket clean.
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

// ─── Global middleware ───
app.use(cors());
app.use(express.json());

// ─── Serve uploaded files ───
app.use('/uploads', express.static('uploads'));

// ─── Health‑check route ───
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Office Task Board API' });
});

// ─── Route modules ───
app.use('/api/users',         require('./routes/userRoutes'));
app.use('/api/boards',        require('./routes/boardRoutes'));
app.use('/api/columns',       require('./routes/columnRoutes'));
app.use('/api/tasks',         require('./routes/taskRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// ─── Global error handler (must be AFTER all routes) ───
app.use(require('./middlewares/errorMiddleware'));

// ─── Start server & sync database ───
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✔  Database connection established.');

    await sequelize.sync({ alter: true });
    console.log('✔  All models synchronised.');

    server.listen(PORT, () => {
      console.log(`✔  Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('✖  Unable to start:', err);
    process.exit(1);
  }
})();
