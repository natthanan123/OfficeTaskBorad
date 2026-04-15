const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TaskLabel = sequelize.define('TaskLabel', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
  }, {
    tableName: 'task_labels',
    indexes: [
      { unique: true, fields: ['task_id', 'label_id'] },
    ],
  });

  return TaskLabel;
};
