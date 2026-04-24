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
    parent_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  }, {
    tableName: 'task_comments',
    underscored: true,
  });

  return TaskComment;
};
