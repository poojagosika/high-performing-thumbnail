const mongoose = require("mongoose");

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return res.status(400).json({ message: `${field}${issue.message}` });
    }

    req.body = result.data;
    next();
  };
}

function validateObjectId(param = "id") {
  return (req, res, next) => {
    const value = req.params[param];
    if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
      return res.status(404).json({ message: "Not found" });
    }
    next();
  };
}

module.exports = { validate, validateObjectId };
