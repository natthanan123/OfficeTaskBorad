const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Label = sequelize.define('Label', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    tableName: 'labels',
  });

  return Label;
};
