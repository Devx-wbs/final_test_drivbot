const Joi = require("joi");

const connectSchema = Joi.object({
  binanceApiKey: Joi.string().required(),
  binanceApiSecret: Joi.string().required(),
  accountName: Joi.string().min(3).max(50).required(),
});

exports.validateConnectRequest = (req, res, next) => {
  const { error } = connectSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
