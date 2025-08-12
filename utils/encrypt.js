const crypto = require("crypto");

const algorithm = "aes-256-cbc";
const secret = Buffer.from(process.env.ENCRYPT_SECRET, "hex");
const iv = Buffer.from(process.env.ENCRYPT_IV, "hex");

exports.encrypt = (text) => {
  const cipher = crypto.createCipheriv(algorithm, secret, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

exports.decrypt = (encrypted) => {
  const decipher = crypto.createDecipheriv(algorithm, secret, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};
