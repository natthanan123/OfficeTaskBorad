const Joi = require('joi');

exports.registerSchema = Joi.object({
  email:     Joi.string().email().required().messages({
    'string.email':  'email must be a valid email address',
    'any.required':  'email is required',
  }),
  password:  Joi.string().min(6).required().messages({
    'string.min':    'password must be at least 6 characters',
    'any.required':  'password is required',
  }),
  full_name: Joi.string().trim().min(1).required().messages({
    'string.empty':  'full_name must not be empty',
    'any.required':  'full_name is required',
  }),
  avatar_url: Joi.string().uri().allow('', null),
  role:       Joi.string().valid('admin', 'member'),
});

exports.loginSchema = Joi.object({
  email:    Joi.string().email().required().messages({
    'string.email':  'email must be a valid email address',
    'any.required':  'email is required',
  }),
  password: Joi.string().required().messages({
    'any.required':  'password is required',
  }),
});
