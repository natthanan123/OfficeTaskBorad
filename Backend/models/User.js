const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    full_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    avatar_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profile_picture: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'member', 
    },
    reset_password_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    defaultScope: {
      attributes: { exclude: ['password_hash', 'reset_password_token', 'reset_password_expires'] },
    },
    scopes: {
      withPassword: { attributes: {} },
    },
  });

  const hashPassword = async (user) => {
    if (user.changed('password_hash')) {
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(user.password_hash, salt);
    }
  };

  User.beforeCreate(hashPassword);
  User.beforeUpdate(hashPassword);

  User.prototype.validatePassword = async function (plainText) {
    return bcrypt.compare(plainText, this.password_hash);
  };

  return User;
};
