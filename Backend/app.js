require('dotenv').config();

const express = require('express');
const http    = require('http');
const cors    = require('cors');
const { sequelize } = require('./models');
const setupSocketServer = require('./sockets/socketServer');

const app    = express();
const server = http.createServer(app);

setupSocketServer(server, app);

// ─── Global middleware ───
app.use(cors());
app.use(express.json());
app.use(require('./middlewares/requestLogger'));

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
