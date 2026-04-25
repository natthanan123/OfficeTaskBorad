const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Column = sequelize.define('Column', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Hex color for the column header accent (same palette as labels)
    color: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // board_id FK is added automatically by the association
  }, {
    tableName: 'columns',
  });

  return Column;
};
