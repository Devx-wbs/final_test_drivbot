const Bot = require("../models/bot");
const User = require("../models/User");
const threeCommas = require("../utils/threeCommas");

// Utility: Validate bot ownership
const validateOwnership = async (botId, userId) => {
  const bot = await Bot.findById(botId).populate("user");
  if (!bot) throw new Error("Bot not found");
  if (!bot.user || bot.user.userId !== userId)
    throw new Error("Unauthorized access");
  return bot;
};

// ✅ GET all bots of a user
exports.getBotsByUserId = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const bots = await Bot.find({ user: user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Bots fetched successfully",
      total: bots.length,
      bots,
    });
  } catch (error) {
    console.error("❌ Error fetching bots:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ✅ Pause bot (only if running)
exports.pauseBot = async (req, res) => {
  const { botId } = req.params;
  const { userId } = req.body;

  try {
    const bot = await validateOwnership(botId, userId);

    if (bot.status !== "running") {
      return res.status(400).json({ message: "Bot is not currently running" });
    }

    await threeCommas.post(`/bots/${bot.threeCommasBotId}/pause`);

    bot.status = "paused";
    await bot.save();

    res
      .status(200)
      .json({ message: "Bot paused successfully", botId: bot._id });
  } catch (error) {
    console.error("❌ Pause error:", error.message);
    res.status(403).json({ message: error.message });
  }
};

// ✅ Start bot (only if stopped or paused)
exports.startBot = async (req, res) => {
  const { botId } = req.params;
  const { userId } = req.body;

  try {
    const bot = await validateOwnership(botId, userId);

    if (bot.status !== "paused" && bot.status !== "stopped") {
      return res
        .status(400)
        .json({ message: "Bot must be paused or stopped to start" });
    }

    await threeCommas.post(`/bots/${bot.threeCommasBotId}/start_new_deal`);

    bot.status = "running";
    await bot.save();

    res
      .status(200)
      .json({ message: "Bot started successfully", botId: bot._id });
  } catch (error) {
    console.error("❌ Start error:", error.message);
    res.status(403).json({ message: error.message });
  }
};

// ✅ Delete bot (only if owned)
exports.deleteBot = async (req, res) => {
  const { botId } = req.params;
  const { userId } = req.body;

  try {
    const bot = await validateOwnership(botId, userId);

    await threeCommas.delete(`/bots/${bot.threeCommasBotId}`);
    await Bot.findByIdAndDelete(botId);

    res.status(200).json({ message: "Bot deleted successfully", botId });
  } catch (error) {
    console.error("❌ Delete error:", error.message);
    res.status(403).json({ message: error.message });
  }
};
