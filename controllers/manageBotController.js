const Bot = require("../models/bot");
const User = require("../models/User");
const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");

const THREE_COMMAS_API_KEY = config.threeCommas.apiKey;
const THREE_COMMAS_API_SECRET = config.threeCommas.apiSecret;
const BASE_URL = config.threeCommas.baseUrl;
const API_PREFIX = config.threeCommas.apiPrefix;

function buildStringToSign(path, queryString, bodyString) {
  const qsPart = queryString ? `?${queryString}` : "";
  const bodyPart = bodyString || "";
  return `${API_PREFIX}${path}${qsPart}${bodyPart}`;
}

function createSignatureFromParts(path, queryString, bodyString) {
  const stringToSign = buildStringToSign(path, queryString, bodyString);
  return crypto
    .createHmac("sha256", THREE_COMMAS_API_SECRET)
    .update(stringToSign)
    .digest("hex");
}

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

    if (!bot.threeCommasBotId) {
      return res.status(400).json({ message: "Bot not linked to 3Commas" });
    }

    // Pause bot in 3Commas
    const path = `/ver1/bots/${bot.threeCommasBotId}/pause`;
    const signature = createSignatureFromParts(path, "", "");

    try {
      await axios.post(
        `${BASE_URL}${path}`,
        {},
        {
          headers: {
            Apikey: THREE_COMMAS_API_KEY,
            Signature: signature,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      console.log("✅ Bot paused in 3Commas successfully");
    } catch (error) {
      console.error(
        "❌ Failed to pause bot in 3Commas:",
        error?.response?.data || error.message
      );
      return res.status(400).json({
        message: "Failed to pause bot in 3Commas",
        error: error?.response?.data || error.message,
      });
    }

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

    if (!bot.threeCommasBotId) {
      return res.status(400).json({ message: "Bot not linked to 3Commas" });
    }

    // Start bot in 3Commas
    const path = `/ver1/bots/${bot.threeCommasBotId}/start_new_deal`;
    const signature = createSignatureFromParts(path, "", "");

    try {
      await axios.post(
        `${BASE_URL}${path}`,
        {},
        {
          headers: {
            Apikey: THREE_COMMAS_API_KEY,
            Signature: signature,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      console.log("✅ Bot started in 3Commas successfully");
    } catch (error) {
      console.error(
        "❌ Failed to start bot in 3Commas:",
        error?.response?.data || error.message
      );
      return res.status(400).json({
        message: "Failed to start bot in 3Commas",
        error: error?.response?.data || error.message,
      });
    }

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

    if (bot.threeCommasBotId) {
      // Delete bot from 3Commas
      const path = `/ver1/bots/${bot.threeCommasBotId}`;
      const signature = createSignatureFromParts(path, "", "");

      try {
        await axios.delete(`${BASE_URL}${path}`, {
          headers: {
            Apikey: THREE_COMMAS_API_KEY,
            Signature: signature,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        });

        console.log("✅ Bot deleted from 3Commas successfully");
      } catch (error) {
        console.error(
          "❌ Failed to delete bot from 3Commas:",
          error?.response?.data || error.message
        );
        // Continue with local deletion even if 3Commas fails
      }
    }

    await Bot.findByIdAndDelete(botId);

    res.status(200).json({ message: "Bot deleted successfully", botId });
  } catch (error) {
    console.error("❌ Delete error:", error.message);
    res.status(403).json({ message: error.message });
  }
};
