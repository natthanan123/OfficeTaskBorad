const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CommentReaction = sequelize.define('CommentReaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    emoji: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
  }, {
    tableName: 'comment_reactions',
    underscored: true,
    indexes: [
      { unique: true, fields: ['comment_id', 'user_id', 'emoji'] },
      { fields: ['comment_id'] },
    ],
  });

  return CommentReaction;
};
