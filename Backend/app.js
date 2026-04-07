require('dotenv').config();

const express = require('express');
const http    = require('http');
const cors    = require('cors');
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

io.on('connection', (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);
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
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/boards',  require('./routes/boardRoutes'));
app.use('/api/columns', require('./routes/columnRoutes'));
app.use('/api/tasks',   require('./routes/taskRoutes'));

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
