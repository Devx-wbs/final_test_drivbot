const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: String, // From Memberstack
    binanceApiKey: String,
    binanceApiSecret: String,
    threeCommasAccountId: Number, // Store the 3Commas account ID
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
