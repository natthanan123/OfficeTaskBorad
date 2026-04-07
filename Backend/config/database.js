const { Sequelize } = require('sequelize');

// ─── Create Sequelize instance from environment variables ───
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',

    // Connection‑pool settings (sensible defaults for a small office app)
    pool: {
      max: 10,
      min: 0,
      acquire: 30000, // ms to wait before throwing a timeout error
      idle: 10000,    // ms before an idle connection is released
    },

    // Keep the console quiet in production
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    // Map model attributes to snake_case columns (created_at, updated_at)
    define: {
      underscored: true, // createdAt → created_at in the DB
      timestamps: true,
    },
  }
);

module.exports = sequelize;
