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
      // Free-form action tag, e.g. 'CREATE_TASK', 'MOVE_TASK',
      // 'UPDATE_STATUS', 'ADD_MEMBER', 'ADD_COMMENT'. Kept as STRING (not
      // ENUM) so new action types can be introduced without a migration.
    },
    details: {
      // JSONB payload for action-specific metadata, e.g.
      //   { from_column: 'To Do', to_column: 'Doing' }
      //   { previous_name: 'Old', new_name: 'New' }
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // board_id / user_id / task_id FKs are added by the associations in
    // models/index.js so the shape stays consistent with the other models.
  }, {
    tableName: 'activity_logs',
    updatedAt: false, // logs are append-only; only created_at matters
    indexes: [
      // The main query path is "latest N entries for this board", so an
      // index on (board_id, created_at DESC) keeps it cheap as the table grows.
      { fields: ['board_id', 'created_at'] },
    ],
  });

  return ActivityLog;
};
