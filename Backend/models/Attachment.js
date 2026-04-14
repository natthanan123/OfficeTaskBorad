const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Either a stored file path (/uploads/attachments/xxx.png) for direct
    // uploads, or the raw external URL for parsed/link attachments.
    filename_or_url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: false,
      // 'image/png', 'image/jpeg', 'link/url', etc.
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_cover: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'direct_upload',
      validate: {
        isIn: {
          args: [['direct_upload', 'description', 'comment']],
          msg: "source must be one of: 'direct_upload', 'description', 'comment'",
        },
      },
    },
    // task_id / user_id FKs come from the associations in models/index.js.
  }, {
    tableName: 'attachments',
    updatedAt: false,
    indexes: [
      { fields: ['task_id'] },
      // Speeds up de-duplication lookups keyed on (task_id, URL).
      { fields: ['task_id', 'filename_or_url'] },
    ],
  });

  return Attachment;
};
