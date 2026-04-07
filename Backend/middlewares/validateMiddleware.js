const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    return res.status(400).json({ status: 'error', message });
  }

  next();
};

module.exports = validate;
