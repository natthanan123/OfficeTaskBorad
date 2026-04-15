const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    filename_or_url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: false,
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
  }, {
    tableName: 'attachments',
    updatedAt: false,
    indexes: [
      { fields: ['task_id'] },
      { fields: ['task_id', 'filename_or_url'] },
    ],
  });

  return Attachment;
};
