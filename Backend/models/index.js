const sequelize = require('../config/database');
const User         = require('./User')(sequelize);
const Board        = require('./Board')(sequelize);
const Column       = require('./Column')(sequelize);
const Task         = require('./Task')(sequelize);
const BoardMember  = require('./BoardMember')(sequelize);
const Notification = require('./Notification')(sequelize);
const Label        = require('./Label')(sequelize);
const TaskLabel    = require('./TaskLabel')(sequelize);
const TaskComment  = require('./TaskComment')(sequelize);
const ActivityLog  = require('./ActivityLog')(sequelize);
const Attachment   = require('./Attachment')(sequelize);

User.hasMany(Board,  { foreignKey: 'creator_id', as: 'boards', onDelete: 'SET NULL' });
Board.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });

Board.hasMany(Column,  { foreignKey: 'board_id', as: 'columns', onDelete: 'CASCADE' });
Column.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

Column.hasMany(Task,   { foreignKey: 'column_id', as: 'tasks', onDelete: 'CASCADE' });
Task.belongsTo(Column, { foreignKey: 'column_id', as: 'column' });


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

Board.hasMany(Label,  { foreignKey: { name: 'board_id', allowNull: false }, as: 'labels', onDelete: 'CASCADE' });
Label.belongsTo(Board, { foreignKey: { name: 'board_id', allowNull: false }, as: 'board' });

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

Task.hasMany(TaskComment, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'comments',
  onDelete: 'CASCADE',
});
TaskComment.belongsTo(Task, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'task',
});

User.hasMany(TaskComment, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'taskComments',
  onDelete: 'CASCADE',
});
TaskComment.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'author',
});

User.hasMany(BoardMember, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'boardMemberships',
  onDelete: 'CASCADE',
});
BoardMember.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'user',
});

Board.hasMany(BoardMember, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'members',
  onDelete: 'CASCADE',
});
BoardMember.belongsTo(Board, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'board',
});

User.hasMany(Notification, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'notifications',
  onDelete: 'CASCADE',
});
Notification.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'user',
});

Board.hasMany(ActivityLog, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'activityLogs',
  onDelete: 'CASCADE',
});
ActivityLog.belongsTo(Board, {
  foreignKey: { name: 'board_id', allowNull: false },
  as: 'board',
});

User.hasMany(ActivityLog, {
  foreignKey: { name: 'user_id', allowNull: true },
  as: 'activityLogs',
  onDelete: 'SET NULL',
});
ActivityLog.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: true },
  as: 'user',
});

Task.hasMany(ActivityLog, {
  foreignKey: { name: 'task_id', allowNull: true },
  as: 'activityLogs',
  onDelete: 'SET NULL',
});
ActivityLog.belongsTo(Task, {
  foreignKey: { name: 'task_id', allowNull: true },
  as: 'task',
});

Task.hasMany(Attachment, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'attachments',
  onDelete: 'CASCADE',
});
Attachment.belongsTo(Task, {
  foreignKey: { name: 'task_id', allowNull: false },
  as: 'task',
});

User.hasMany(Attachment, {
  foreignKey: { name: 'user_id', allowNull: true },
  as: 'attachments',
  onDelete: 'SET NULL',
});
Attachment.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: true },
  as: 'uploader',
});

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
  ActivityLog,
  Attachment,
};
