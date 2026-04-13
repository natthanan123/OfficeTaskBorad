const sequelize = require('../config/database');

// ─── Import model definitions ───
const User         = require('./User')(sequelize);
const Board        = require('./Board')(sequelize);
const Column       = require('./Column')(sequelize);
const Task         = require('./Task')(sequelize);
const BoardMember  = require('./BoardMember')(sequelize);
const Notification = require('./Notification')(sequelize);
const Label        = require('./Label')(sequelize);
const TaskLabel    = require('./TaskLabel')(sequelize);
const TaskComment  = require('./TaskComment')(sequelize);

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

// ── Board (1) ──> Label (N) ──
// Labels live inside a single board's palette and are removed with the board.
Board.hasMany(Label,  { foreignKey: { name: 'board_id', allowNull: false }, as: 'labels', onDelete: 'CASCADE' });
Label.belongsTo(Board, { foreignKey: { name: 'board_id', allowNull: false }, as: 'board' });

// ── Task (M) <──> Label (N)  [via TaskLabel junction] ──
Task.belongsToMany(Label, {
  through: TaskLabel,
  foreignKey: 'task_id',
  otherKey: 'label_id',
  as: 'labels',
  onDelete: 'CASCADE',
});
Label.belongsToMany(Task, {
  through: TaskLabel,
  foreignKey: 'label_id',
  otherKey: 'task_id',
  as: 'tasks',
  onDelete: 'CASCADE',
});

// ── Task (1) ──> TaskComment (N) ──
Task.hasMany(TaskComment, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'comments',
  onDelete: 'CASCADE',
});
TaskComment.belongsTo(Task, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'task',
});

// ── User (1) ──> TaskComment (N) ──
User.hasMany(TaskComment, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'taskComments',
  onDelete: 'CASCADE',
});
TaskComment.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'author',
});

// ── Task (1) ──> Attachment (N)  [model coming later] ──

// ── User (1) ──> BoardMember (N) ──
// A user can have many board memberships (across different boards).
User.hasMany(BoardMember, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'boardMemberships',
  onDelete: 'CASCADE',
});
BoardMember.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'user',
});

// ── Board (1) ──> BoardMember (N) ──
// A board has many members; deleting a board removes its membership rows.
Board.hasMany(BoardMember, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'members',
  onDelete: 'CASCADE',
});
BoardMember.belongsTo(Board, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'board',
});

// ── User (1) ──> Notification (N) ──
// A notification always belongs to exactly one recipient user.
User.hasMany(Notification, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'notifications',
  onDelete: 'CASCADE',
});
Notification.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'user',
});

// ─── Export everything the rest of the app needs ───
module.exports = {
  sequelize,
  User,
  Board,
  Column,
  Task,
  BoardMember,
  Notification,
  Label,
  TaskLabel,
  TaskComment,
};
