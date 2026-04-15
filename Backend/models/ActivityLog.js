const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ActivityLog = sequelize.define('ActivityLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: false,
     
    },
    details: {

      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    tableName: 'activity_logs',
    updatedAt: false,
    indexes: [
      { fields: ['board_id', 'created_at'] },
    ],
  });

  return ActivityLog;
};
