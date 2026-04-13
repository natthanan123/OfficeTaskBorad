const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TaskLabel = sequelize.define('TaskLabel', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // task_id and label_id FKs are added by the Task <-> Label belongsToMany
    // association in models/index.js (this model is the `through` table).
  }, {
    tableName: 'task_labels',
    indexes: [
      { unique: true, fields: ['task_id', 'label_id'] },
    ],
  });

  return TaskLabel;
};
