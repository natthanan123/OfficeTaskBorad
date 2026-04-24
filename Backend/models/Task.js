const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'tasks',
  });

  return Task;
};
