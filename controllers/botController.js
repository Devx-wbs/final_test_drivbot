const Bot = require("../models/bot");
const User = require("../models/User");
const axios = require("axios");
const crypto = require("crypto");

const THREE_COMMAS_API_KEY = process.env.THREE_COMMAS_API_KEY;
const THREE_COMMAS_API_SECRET = process.env.THREE_COMMAS_API_SECRET;
const BASE_URL = "https://api.3commas.io/public/api";
const API_PREFIX = "/public/api";

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

    const mappedBotType = botType === "single" ? "simple" : "composite";

    // 3Commas bot creation payload
    const botPayload = {
      name: botName,
      account_id:
        user.threeCommasAccountId || process.env.THREE_COMMAS_ACCOUNT_ID,
      pair,
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
    };

    console.log("🔍 Attempting to create bot in 3Commas...");
    console.log("📦 Bot payload being sent to 3Commas:", botPayload);

    // Create signature for 3Commas API
    const path = "/ver1/bots/create_bot";
    const payload = JSON.stringify(botPayload);
    const signature = createSignatureFromParts(path, "", payload);

    // Make request to 3Commas
    let threeCommasBotId = null;
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
    } catch (error) {
      console.error(
        "❌ 3Commas bot creation failed:",
        error?.response?.data || error
      );
      // Continue with local bot creation even if 3Commas fails
    }

    // ✅ Save your own bot in MongoDB
    const newBot = new Bot({
      user: user._id,
      name: botName,
      exchangeId:
        user.threeCommasAccountId || process.env.THREE_COMMAS_ACCOUNT_ID,
      pair,
      strategy: direction,
      botType,
      profitCurrency,
      baseOrderSize,
      startOrderType,
      takeProfitType,
      targetProfitPercent,
      threeCommasBotId: threeCommasBotId,
    });

    await newBot.save();

    res.status(201).json({
      message: "Bot created successfully",
      botId: newBot._id,
      threeCommasBotId: threeCommasBotId,
      bot: newBot,
    });
  } catch (error) {
    console.error("❌ Bot creation failed:", error?.response?.data || error);
    res.status(500).json({
      message: "Bot creation failed",
      error: error?.response?.data || error.message || error,
    });
  }
};
