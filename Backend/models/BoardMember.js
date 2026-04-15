const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BoardMember = sequelize.define('BoardMember', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'member',
      validate: {
        isIn: {
          args: [['owner', 'admin', 'member']],
          msg: "role must be one of: 'owner', 'admin', 'member'",
        },
      },
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'accepted', 'rejected']],
          msg: "status must be one of: 'pending', 'accepted', 'rejected'",
        },
      },
    },
  }, {
    tableName: 'board_members',
    indexes: [
      { unique: true, fields: ['user_id', 'board_id'] },
    ],
  });

  return BoardMember;
};
