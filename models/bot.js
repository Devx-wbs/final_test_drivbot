const mongoose = require("mongoose");

const botSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    exchangeId: {
      type: Number,
      required: true,
    },
    pair: {
      type: String,
      required: true,
    },
    strategy: {
      type: String,
      enum: ["long", "short"],
      required: true,
    },
    botType: {
      type: String,
      enum: ["single", "multi"],
      required: true,
    },
    profitCurrency: {
      type: String,
      enum: ["quote", "base"],
      required: true,
    },
    baseOrderSize: {
      type: Number,
      required: true,
    },
    startOrderType: {
      type: String,
      enum: ["market", "limit"],
      required: true,
    },
    takeProfitType: {
      type: String,
      enum: ["total", "step"],
      required: true,
    },
    targetProfitPercent: {
      type: Number,
      required: true,
    },
    threeCommasBotId: {
      type: Number, // optional: for future operations via 3Commas
      default: null,
    },
    status: {
      type: String,
      enum: ["running", "paused", "stopped"],
      default: "running",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bot", botSchema);
