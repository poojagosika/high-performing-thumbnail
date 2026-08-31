const User = require("../models/User");
const { verifyToken } = require("../config/security");

const auth = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select("+tokenVersion");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = auth;
