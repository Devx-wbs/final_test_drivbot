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
  console.log("3Commas Bot Creation - stringToSign:", {
    path: `${API_PREFIX}${path}`,
    hasQuery: Boolean(queryString),
    hasBody: Boolean(bodyString),
    bodyLength: bodyString ? Buffer.byteLength(bodyString, "utf8") : 0,
    preview:
      stringToSign.slice(0, 120) + (stringToSign.length > 120 ? "…" : ""),
  });
  return crypto
    .createHmac("sha256", THREE_COMMAS_API_SECRET)
    .update(stringToSign)
    .digest("hex");
}

const isValidEnum = (val, options) => options.includes(val);

exports.createBot = async (req, res) => {
  const {
    userId,
    botName,
    direction,
    botType,
    pair,
    profitCurrency,
    baseOrderSize,
    startOrderType,
    takeProfitType,
    targetProfitPercent,
  } = req.body;

  // 🛡 Validation
  if (
    !userId ||
    !botName ||
    !direction ||
    !botType ||
    !pair ||
    !profitCurrency ||
    !baseOrderSize ||
    !startOrderType ||
    !takeProfitType ||
    !targetProfitPercent
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }

  if (!isValidEnum(direction, ["long", "short"])) {
    return res
      .status(400)
      .json({ message: "Direction must be 'long' or 'short'" });
  }

  if (!isValidEnum(botType, ["single", "multi"])) {
    return res
      .status(400)
      .json({ message: "Bot type must be 'single' or 'multi'" });
  }

  if (!isValidEnum(profitCurrency, ["quote", "base"])) {
    return res
      .status(400)
      .json({ message: "Profit currency must be 'quote' or 'base'" });
  }

  if (!isValidEnum(startOrderType, ["market", "limit"])) {
    return res
      .status(400)
      .json({ message: "Start order type must be 'market' or 'limit'" });
  }

  if (!isValidEnum(takeProfitType, ["total", "step"])) {
    return res
      .status(400)
      .json({ message: "Take profit type must be 'total' or 'step'" });
  }

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if user has 3Commas account ID
    if (!user.threeCommasAccountId) {
      return res.status(400).json({
        message:
          "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    const mappedBotType = botType === "single" ? "simple" : "composite";

    // 3Commas bot creation payload - Updated with correct structure
    const botPayload = {
      name: botName,
      account_id: user.threeCommasAccountId,
      pair: pair,
      strategy: direction,
      bot_type: mappedBotType,
      profit_currency: profitCurrency,
      base_order_volume: parseFloat(baseOrderSize),
      start_order_type: startOrderType,
      take_profit_type: takeProfitType,
      take_profit: parseFloat(targetProfitPercent),
      safety_order_type: "market",
      safety_order_volume: parseFloat(baseOrderSize),
      max_safety_orders: 5,
      safety_order_step_percentage: 2.0,
      safety_order_volume_type: "quote_currency",
      max_active_deals: 1,
      active: true,
      // Additional required fields for 3Commas
      martingale_volume_coefficient: 1.0,
      martingale_step_coefficient: 1.0,
      stop_loss_percentage: 0,
      cooldown: 0,
      btc_price_limit: 0,
      strategy_list: [],
      // For composite bots
      pairs: botType === "multi" ? [pair] : undefined,
      // Required for all bots
      base_order_volume_type: "quote_currency",
      safety_order_volume_type: "quote_currency",
      // Optional but recommended
      note: `Bot created via API for ${userId}`,
    };

    console.log("🔍 Attempting to create bot in 3Commas...");
    console.log("📦 Bot payload being sent to 3Commas:", botPayload);

    // Create signature for 3Commas API - Fixed endpoint
    const path = "/ver1/bots";
    const payload = JSON.stringify(botPayload);
    const signature = createSignatureFromParts(path, "", payload);

    // Make request to 3Commas
    let threeCommasBotId = null;
    let threeCommasResponse = null;

    try {
      const response = await axios.post(`${BASE_URL}${path}`, botPayload, {
        headers: {
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      console.log("✅ 3Commas bot creation successful:", response.data);
      threeCommasBotId = response.data.id;
      threeCommasResponse = response.data;
    } catch (error) {
      console.error(
        "❌ 3Commas bot creation failed:",
        error?.response?.data || error.message
      );

      // Return error instead of continuing with local bot creation
      return res.status(400).json({
        message: "Failed to create bot in 3Commas",
        error: error?.response?.data || error.message,
        details:
          "Please check your 3Commas account configuration and try again.",
      });
    }

    // ✅ Save bot in MongoDB only if 3Commas creation was successful
    const newBot = new Bot({
      user: user._id,
      name: botName,
      exchangeId: user.threeCommasAccountId,
      pair,
      strategy: direction,
      botType,
      profitCurrency,
      baseOrderSize,
      startOrderType,
      takeProfitType,
      targetProfitPercent,
      threeCommasBotId: threeCommasBotId,
      status: "running",
    });

    await newBot.save();

    res.status(201).json({
      message: "Bot created successfully in 3Commas",
      botId: newBot._id,
      threeCommasBotId: threeCommasBotId,
      bot: newBot,
      threeCommasData: threeCommasResponse,
    });
  } catch (error) {
    console.error("❌ Bot creation failed:", error?.response?.data || error);
    res.status(500).json({
      message: "Bot creation failed",
      error: error?.response?.data || error.message || error,
    });
  }
};

// ✅ Verify bot creation in 3Commas
exports.verifyBotCreation = async (req, res) => {
  try {
    const { botId } = req.params;

    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    if (!bot.threeCommasBotId) {
      return res.status(400).json({
        message: "Bot was not created in 3Commas",
        botId: bot._id,
      });
    }

    // Check if bot exists in 3Commas
    const path = `/ver1/bots/${bot.threeCommasBotId}`;
    const signature = createSignatureFromParts(path, "", "");

    try {
      const response = await axios.get(`${BASE_URL}${path}`, {
        headers: {
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      console.log("✅ Bot verification successful:", response.data);

      return res.json({
        message: "Bot verified in 3Commas",
        botId: bot._id,
        threeCommasBotId: bot.threeCommasBotId,
        botData: response.data,
        status: "verified",
      });
    } catch (error) {
      console.error(
        "❌ Bot verification failed:",
        error?.response?.data || error.message
      );

      return res.status(400).json({
        message: "Bot not found in 3Commas",
        botId: bot._id,
        threeCommasBotId: bot.threeCommasBotId,
        error: error?.response?.data || error.message,
        status: "not_found",
      });
    }
  } catch (error) {
    console.error("❌ Bot verification error:", error);
    res.status(500).json({
      message: "Bot verification failed",
      error: error.message,
    });
  }
};

// ✅ List all bots from 3Commas
exports.listThreeCommasBots = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const user = await User.findOne({ userId });
    if (!user || !user.threeCommasAccountId) {
      return res.status(400).json({
        message:
          "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    const path = "/ver1/bots";
    const signature = createSignatureFromParts(path, "", "");

    try {
      const response = await axios.get(`${BASE_URL}${path}`, {
        headers: {
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      console.log("✅ 3Commas bots list retrieved:", response.data);

      // Filter bots for this user's account
      const userBots = response.data.filter(
        (bot) => bot.account_id === user.threeCommasAccountId
      );

      return res.json({
        message: "3Commas bots retrieved successfully",
        totalBots: response.data.length,
        userBots: userBots.length,
        bots: userBots,
        accountId: user.threeCommasAccountId,
      });
    } catch (error) {
      console.error(
        "❌ Failed to retrieve 3Commas bots:",
        error?.response?.data || error.message
      );

      return res.status(400).json({
        message: "Failed to retrieve bots from 3Commas",
        error: error?.response?.data || error.message,
      });
    }
  } catch (error) {
    console.error("❌ List bots error:", error);
    res.status(500).json({
      message: "Failed to list bots",
      error: error.message,
    });
  }
};
