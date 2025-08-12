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
    // Enhanced safety order configuration
    safetyOrderVolume: {
      type: Number,
      default: function () {
        return this.baseOrderSize;
      },
    },
    maxSafetyOrders: {
      type: Number,
      default: 5,
      min: 1,
      max: 25,
    },
    safetyOrderStepPercentage: {
      type: Number,
      default: 2.0,
      min: 0.1,
      max: 50.0,
    },
    // Risk management
    stopLossPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    cooldown: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Additional configuration
    note: {
      type: String,
      default: "",
    },
    threeCommasBotId: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["running", "paused", "stopped", "error"],
      default: "running",
    },
    // Performance tracking
    totalDeals: {
      type: Number,
      default: 0,
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    lastDealAt: {
      type: Date,
      default: null,
    },
    // Bot configuration version
    configVersion: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Index for better query performance
botSchema.index({ user: 1, name: 1 }, { unique: true });
botSchema.index({ user: 1, status: 1 });
botSchema.index({ threeCommasBotId: 1 });

// Virtual for total value
botSchema.virtual("totalValue").get(function () {
  return this.baseOrderSize + this.safetyOrderVolume * this.maxSafetyOrders;
});

// Method to update performance metrics
botSchema.methods.updatePerformance = function (dealData) {
  this.totalDeals += 1;
  this.totalProfit += dealData.profit || 0;
  this.lastDealAt = new Date();
  return this.save();
};

// Method to validate bot configuration
botSchema.methods.validateConfig = function () {
  const errors = [];

  if (this.baseOrderSize <= 0) {
    errors.push("Base order size must be greater than 0");
  }

  if (this.targetProfitPercent <= 0 || this.targetProfitPercent > 100) {
    errors.push("Target profit percentage must be between 0 and 100");
  }

  if (this.maxSafetyOrders < 1 || this.maxSafetyOrders > 25) {
    errors.push("Max safety orders must be between 1 and 25");
  }

  if (
    this.safetyOrderStepPercentage < 0.1 ||
    this.safetyOrderStepPercentage > 50
  ) {
    errors.push("Safety order step percentage must be between 0.1 and 50");
  }

  return errors;
};

module.exports = mongoose.model("Bot", botSchema);
