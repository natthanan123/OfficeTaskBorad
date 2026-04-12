const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      // e.g. 'board_invite'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    reference_id: {
      // Generic pointer to a related entity (e.g. board_id for a board_invite).
      // UUID to stay consistent with every PK in this project.
      type: DataTypes.UUID,
      allowNull: true,
    },
    // user_id FK (recipient) is added by the association in models/index.js
  }, {
    tableName: 'notifications',
  });

  return Notification;
};
