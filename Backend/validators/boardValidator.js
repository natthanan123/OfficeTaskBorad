const Joi = require('joi');

exports.createBoardSchema = Joi.object({
  title: Joi.string().trim().min(1).required().messages({
    'string.empty': 'title must not be empty',
    'any.required': 'title is required',
  }),
  description: Joi.string().allow('', null),
});
