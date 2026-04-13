const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TaskComment = sequelize.define('TaskComment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // task_id and user_id FKs are added by the associations in models/index.js
  }, {
    tableName: 'task_comments',
    underscored: true,
  });

  return TaskComment;
};
