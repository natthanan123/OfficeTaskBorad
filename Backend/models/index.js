const sequelize = require('../config/database');

// ─── Import model definitions ───
const User   = require('./User')(sequelize);
const Board  = require('./Board')(sequelize);
const Column = require('./Column')(sequelize);
const Task   = require('./Task')(sequelize);

// ═══════════════════════════════════════════
//  Associations
// ═══════════════════════════════════════════

// ── User (1) ──> Board (N) ──
// A user creates many boards; each board has one creator.
User.hasMany(Board,  { foreignKey: 'creator_id', as: 'boards', onDelete: 'SET NULL' });
Board.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });

// ── Board (1) ──> Column (N) ──
Board.hasMany(Column,  { foreignKey: 'board_id', as: 'columns', onDelete: 'CASCADE' });
Column.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

// ── Column (1) ──> Task (N) ──
Column.hasMany(Task,   { foreignKey: 'column_id', as: 'tasks', onDelete: 'CASCADE' });
Task.belongsTo(Column, { foreignKey: 'column_id', as: 'column' });

// ── Task (M) <──> User (N)  [Assignees] ──
// Junction table: task_assignees
Task.belongsToMany(User, {
  through: 'task_assignees',
  foreignKey: 'task_id',
  otherKey: 'user_id',
  as: 'assignees',
});
User.belongsToMany(Task, {
  through: 'task_assignees',
  foreignKey: 'user_id',
  otherKey: 'task_id',
  as: 'assignedTasks',
});

// ── Task (1) ──> Comment (N)  [placeholder FK — model coming later] ──
// ── Task (1) ──> Attachment (N)
// ── Task (M) <──> Label (N)
// These will be added when we create the Comment, Attachment, and Label models.

// ─── Export everything the rest of the app needs ───
module.exports = {
  sequelize,
  User,
  Board,
  Column,
  Task,
};
