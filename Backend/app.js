require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { sequelize } = require('./models');

const app = express();

// ─── Global middleware ───
app.use(cors());
app.use(express.json());

// ─── Health‑check route ───
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Office Task Board API' });
});

// ─── Route modules ───
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/boards', require('./routes/boardRoutes'));

// ─── Start server & sync database ───
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // Test the DB connection
    await sequelize.authenticate();
    console.log('✔  Database connection established.');

    // Sync all models to the database.
    // NOTE: { alter: true } adjusts existing tables to match models.
    //       Use { force: true } only in early development — it drops & recreates tables!
    await sequelize.sync({ alter: true });
    console.log('✔  All models synchronised.');

    app.listen(PORT, () => {
      console.log(`✔  Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('✖  Unable to start:', err);
    process.exit(1);
  }
})();
