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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'member', // 'admin' | 'member'
    },
  }, {
    tableName: 'users',
    defaultScope: {
      attributes: { exclude: ['password_hash'] },
    },
    scopes: {
      withPassword: { attributes: {} }, // Use User.scope('withPassword') when you need it (e.g. login)
    },
  });

  // ─── Password‑hashing hook ───
  // Fires before CREATE and UPDATE; only re‑hashes when the value changed.
  const hashPassword = async (user) => {
    if (user.changed('password_hash')) {
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(user.password_hash, salt);
    }
  };

  User.beforeCreate(hashPassword);
  User.beforeUpdate(hashPassword);

  // Convenience method — keeps bcrypt out of controller code
  User.prototype.validatePassword = async function (plainText) {
    return bcrypt.compare(plainText, this.password_hash);
  };

  return User;
};
