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

app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
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

// ─── Global middleware ───
app.use(cors());
app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ limit: '2gb', extended: true }));

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
app.use('/api/attachments',   require('./routes/attachmentRoutes'));
app.use('/api/comments',      require('./routes/commentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/line',          require('./routes/lineRoutes'));

// ─── Global error handler ───
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