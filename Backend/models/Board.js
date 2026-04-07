const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Board = sequelize.define('Board', {
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
    // creator_id FK is added automatically by the association in models/index.js
  }, {
    tableName: 'boards',
  });

  return Board;
};
