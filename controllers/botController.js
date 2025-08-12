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

// ✅ Create Bot with enhanced validation and features
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
    safetyOrderVolume,
    maxSafetyOrders,
    safetyOrderStepPercentage,
    stopLossPercentage,
    cooldown,
    note
  } = req.body;

  // 🛡 Enhanced Validation
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
    return res.status(400).json({ 
      success: false,
      message: "All required fields are missing. Please check your input." 
    });
  }

  // Validate pair format (e.g., BTC_USDT, ETH_USDT)
  if (!/^[A-Z0-9]+_[A-Z0-9]+$/.test(pair)) {
    return res.status(400).json({ 
      success: false,
      message: "Invalid pair format. Use format like BTC_USDT, ETH_USDT" 
    });
  }

  if (!isValidEnum(direction, ["long", "short"])) {
    return res
      .status(400)
      .json({ success: false, message: "Direction must be 'long' or 'short'" });
  }

  if (!isValidEnum(botType, ["single", "multi"])) {
    return res
      .status(400)
      .json({ success: false, message: "Bot type must be 'single' or 'multi'" });
  }

  if (!isValidEnum(profitCurrency, ["quote", "base"])) {
    return res
      .status(400)
      .json({ success: false, message: "Profit currency must be 'quote' or 'base'" });
  }

  if (!isValidEnum(startOrderType, ["market", "limit"])) {
    return res
      .status(400)
      .json({ success: false, message: "Start order type must be 'market' or 'limit'" });
  }

  if (!isValidEnum(takeProfitType, ["total", "step"])) {
    return res
      .status(400)
      .json({ success: false, message: "Take profit type must be 'total' or 'step'" });
  }

  // Validate numeric values
  if (baseOrderSize <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Base order size must be greater than 0" 
    });
  }

  if (targetProfitPercent <= 0 || targetProfitPercent > 100) {
    return res.status(400).json({ 
      success: false, 
      message: "Target profit percentage must be between 0 and 100" 
    });
  }

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found. Please check your user ID." 
      });
    }

    // Check if user has 3Commas account ID
    if (!user.threeCommasAccountId) {
      return res.status(400).json({
        success: false,
        message: "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    // Check if bot name already exists for this user
    const existingBot = await Bot.findOne({ 
      user: user._id, 
      name: botName 
    });
    
    if (existingBot) {
      return res.status(400).json({
        success: false,
        message: "A bot with this name already exists. Please choose a different name."
      });
    }

    const mappedBotType = botType === "single" ? "simple" : "composite";

    // Enhanced 3Commas bot creation payload
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
      safety_order_volume: parseFloat(safetyOrderVolume || baseOrderSize),
      max_safety_orders: parseInt(maxSafetyOrders || 5),
      safety_order_step_percentage: parseFloat(safetyOrderStepPercentage || 2.0),
      safety_order_volume_type: "quote_currency",
      max_active_deals: 1,
      active: true,
      // Additional required fields for 3Commas
      martingale_volume_coefficient: 1.0,
      martingale_step_coefficient: 1.0,
      stop_loss_percentage: parseFloat(stopLossPercentage || 0),
      cooldown: parseInt(cooldown || 0),
      btc_price_limit: 0,
      strategy_list: [],
      // For composite bots
      pairs: botType === "multi" ? [pair] : undefined,
      // Required for all bots
      base_order_volume_type: "quote_currency",
      safety_order_volume_type: "quote_currency",
      // Optional but recommended
      note: note || `Bot created via API for ${userId}`,
    };

    console.log("🔍 Attempting to create bot in 3Commas...");
    console.log("📦 Bot payload being sent to 3Commas:", botPayload);

    // Create signature for 3Commas API
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

      return res.status(400).json({
        success: false,
        message: "Failed to create bot in 3Commas",
        error: error?.response?.data || error.message,
        details: "Please check your 3Commas account configuration and try again.",
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
      safetyOrderVolume: safetyOrderVolume || baseOrderSize,
      maxSafetyOrders: maxSafetyOrders || 5,
      safetyOrderStepPercentage: safetyOrderStepPercentage || 2.0,
      stopLossPercentage: stopLossPercentage || 0,
      cooldown: cooldown || 0,
      note: note || `Bot created via API for ${userId}`,
      threeCommasBotId: threeCommasBotId,
      status: "running",
    });

    await newBot.save();

    res.status(201).json({
      success: true,
      message: "Bot created successfully in 3Commas",
      botId: newBot._id,
      threeCommasBotId: threeCommasBotId,
      bot: newBot,
      threeCommasData: threeCommasResponse,
    });
  } catch (error) {
    console.error("❌ Bot creation failed:", error?.response?.data || error);
    res.status(500).json({
      success: false,
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

// ✅ Get Bot Statistics and Performance
exports.getBotStats = async (req, res) => {
  try {
    const { userId } = req.query;
    const { botId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: "userId is required" 
      });
    }

    const user = await User.findOne({ userId });
    if (!user || !user.threeCommasAccountId) {
      return res.status(400).json({
        success: false,
        message: "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    if (botId) {
      // Get specific bot stats
      const bot = await Bot.findById(botId);
      if (!bot || bot.user.toString() !== user._id.toString()) {
        return res.status(404).json({
          success: false,
          message: "Bot not found or access denied"
        });
      }

      if (!bot.threeCommasBotId) {
        return res.status(400).json({
          success: false,
          message: "Bot not linked to 3Commas"
        });
      }

      // Get bot details from 3Commas
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

        const botData = response.data;
        
        // Calculate performance metrics
        const performance = {
          totalDeals: botData.total_deals || 0,
          activeDeals: botData.active_deals || 0,
          totalProfit: botData.total_profit || 0,
          totalProfitPercent: botData.total_profit_percentage || 0,
          averageProfit: botData.total_deals > 0 ? botData.total_profit / botData.total_deals : 0,
          winRate: botData.win_deals > 0 ? (botData.win_deals / botData.total_deals) * 100 : 0,
          lastDealAt: botData.last_deal_at || null,
          createdAt: botData.created_at || null,
          updatedAt: botData.updated_at || null
        };

        return res.json({
          success: true,
          message: "Bot statistics retrieved successfully",
          bot: bot,
          threeCommasData: botData,
          performance: performance
        });
      } catch (error) {
        console.error("❌ Failed to get bot stats from 3Commas:", error?.response?.data || error.message);
        return res.status(400).json({
          success: false,
          message: "Failed to get bot statistics from 3Commas",
          error: error?.response?.data || error.message,
        });
      }
    } else {
      // Get all bots stats for user
      const bots = await Bot.find({ user: user._id });
      
      if (bots.length === 0) {
        return res.json({
          success: true,
          message: "No bots found for this user",
          totalBots: 0,
          bots: [],
          summary: {
            totalProfit: 0,
            activeBots: 0,
            totalDeals: 0
          }
        });
      }

      // Get summary stats from 3Commas
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

        const userBots = response.data.filter(
          (bot) => bot.account_id === user.threeCommasAccountId
        );

        const summary = {
          totalBots: userBots.length,
          activeBots: userBots.filter(bot => bot.is_enabled).length,
          totalProfit: userBots.reduce((sum, bot) => sum + (bot.total_profit || 0), 0),
          totalDeals: userBots.reduce((sum, bot) => sum + (bot.total_deals || 0), 0),
          averageProfit: userBots.length > 0 ? userBots.reduce((sum, bot) => sum + (bot.total_profit || 0), 0) / userBots.length : 0
        };

        return res.json({
          success: true,
          message: "Bot statistics retrieved successfully",
          totalBots: bots.length,
          bots: bots,
          threeCommasBots: userBots,
          summary: summary
        });
      } catch (error) {
        console.error("❌ Failed to get bots summary from 3Commas:", error?.response?.data || error.message);
        
        // Return local bot data even if 3Commas fails
        return res.json({
          success: true,
          message: "Bot list retrieved (3Commas data unavailable)",
          totalBots: bots.length,
          bots: bots,
          summary: {
            totalBots: bots.length,
            activeBots: bots.filter(bot => bot.status === "running").length,
            totalProfit: 0,
            totalDeals: 0,
            averageProfit: 0
          }
        });
      }
    }
  } catch (error) {
    console.error("❌ Get bot stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bot statistics",
      error: error.message,
    });
  }
};

// ✅ Update Bot Configuration
exports.updateBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const { userId, ...updateData } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: "userId is required" 
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const bot = await Bot.findById(botId);
    if (!bot || bot.user.toString() !== user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: "Bot not found or access denied"
      });
    }

    if (!bot.threeCommasBotId) {
      return res.status(400).json({
        success: false,
        message: "Bot not linked to 3Commas"
      });
    }

    // Update bot in 3Commas
    const path = `/ver1/bots/${bot.threeCommasBotId}`;
    const payload = JSON.stringify(updateData);
    const signature = createSignatureFromParts(path, "", payload);

    try {
      await axios.patch(`${BASE_URL}${path}`, updateData, {
        headers: {
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      console.log("✅ Bot updated in 3Commas successfully");
    } catch (error) {
      console.error("❌ Failed to update bot in 3Commas:", error?.response?.data || error.message);
      return res.status(400).json({
        success: false,
        message: "Failed to update bot in 3Commas",
        error: error?.response?.data || error.message,
      });
    }

    // Update local bot data
    const updatedBot = await Bot.findByIdAndUpdate(
      botId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Bot updated successfully",
      bot: updatedBot
    });
  } catch (error) {
    console.error("❌ Update bot error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update bot",
      error: error.message,
    });
  }
};

// ✅ Get Bot Performance Metrics
exports.getBotPerformance = async (req, res) => {
  try {
    const { botId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: "userId is required" 
      });
    }

    const user = await User.findOne({ userId });
    if (!user || !user.threeCommasAccountId) {
      return res.status(400).json({
        success: false,
        message: "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    const bot = await Bot.findById(botId);
    if (!bot || bot.user.toString() !== user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: "Bot not found or access denied"
      });
    }

    if (!bot.threeCommasBotId) {
      return res.status(400).json({
        success: false,
        message: "Bot not linked to 3Commas"
      });
    }

    // Get bot deals from 3Commas
    const path = `/ver1/bots/${bot.threeCommasBotId}/deals`;
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

      const deals = response.data || [];
      
      // Calculate performance metrics
      const performance = {
        totalDeals: deals.length,
        completedDeals: deals.filter(deal => deal.status === 'finished').length,
        activeDeals: deals.filter(deal => deal.status === 'active').length,
        totalProfit: deals.reduce((sum, deal) => sum + (deal.final_profit || 0), 0),
        totalProfitPercent: deals.reduce((sum, deal) => sum + (deal.final_profit_percentage || 0), 0),
        averageProfit: deals.length > 0 ? deals.reduce((sum, deal) => sum + (deal.final_profit || 0), 0) / deals.length : 0,
        winRate: deals.length > 0 ? (deals.filter(deal => (deal.final_profit || 0) > 0).length / deals.length) * 100 : 0,
        bestDeal: deals.length > 0 ? Math.max(...deals.map(deal => deal.final_profit || 0)) : 0,
        worstDeal: deals.length > 0 ? Math.min(...deals.map(deal => deal.final_profit || 0)) : 0,
        averageDealDuration: deals.length > 0 ? 
          deals.reduce((sum, deal) => {
            const start = new Date(deal.created_at);
            const end = deal.finished_at ? new Date(deal.finished_at) : new Date();
            return sum + (end - start);
          }, 0) / deals.length : 0
      };

      return res.json({
        success: true,
        message: "Bot performance retrieved successfully",
        bot: bot,
        deals: deals,
        performance: performance
      });
    } catch (error) {
      console.error("❌ Failed to get bot deals from 3Commas:", error?.response?.data || error.message);
      return res.status(400).json({
        success: false,
        message: "Failed to get bot deals from 3Commas",
        error: error?.response?.data || error.message,
      });
    }
  } catch (error) {
    console.error("❌ Get bot performance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bot performance",
      error: error.message,
    });
  }
};

// ✅ Get Bot Deals
exports.getBotDeals = async (req, res) => {
  try {
    const { botId } = req.params;
    const { userId, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: "userId is required" 
      });
    }

    const user = await User.findOne({ userId });
    if (!user || !user.threeCommasAccountId) {
      return res.status(400).json({
        success: false,
        message: "No 3Commas account found. Please connect your Binance account first.",
      });
    }

    const bot = await Bot.findById(botId);
    if (!bot || bot.user.toString() !== user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: "Bot not found or access denied"
      });
    }

    if (!bot.threeCommasBotId) {
      return res.status(400).json({
        success: false,
        message: "Bot not linked to 3Commas"
      });
    }

    // Get bot deals from 3Commas with pagination
    const path = `/ver1/bots/${bot.threeCommasBotId}/deals`;
    const queryString = `limit=${limit}&offset=${offset}`;
    const signature = createSignatureFromParts(path, queryString, "");

    try {
      const response = await axios.get(`${BASE_URL}${path}?${queryString}`, {
        headers: {
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      const deals = response.data || [];
      
      return res.json({
        success: true,
        message: "Bot deals retrieved successfully",
        bot: bot,
        deals: deals,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: deals.length
        }
      });
    } catch (error) {
      console.error("❌ Failed to get bot deals from 3Commas:", error?.response?.data || error.message);
      return res.status(400).json({
        success: false,
        message: "Failed to get bot deals from 3Commas",
        error: error?.response?.data || error.message,
      });
    }
  } catch (error) {
    console.error("❌ Get bot deals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bot deals",
      error: error.message,
    });
  }
};

// ✅ Duplicate Bot
exports.duplicateBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const { userId, newName } = req.body;

    if (!userId || !newName) {
      return res.status(400).json({ 
        success: false,
        message: "userId and newName are required" 
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const originalBot = await Bot.findById(botId);
    if (!originalBot || originalBot.user.toString() !== user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: "Bot not found or access denied"
      });
    }

    // Check if new name already exists
    const existingBot = await Bot.findOne({ 
      user: user._id, 
      name: newName 
    });
    
    if (existingBot) {
      return res.status(400).json({
        success: false,
        message: "A bot with this name already exists. Please choose a different name."
      });
    }

    // Create new bot in 3Commas with modified name
    const botPayload = {
      name: newName,
      account_id: user.threeCommasAccountId,
      pair: originalBot.pair,
      strategy: originalBot.strategy,
      bot_type: originalBot.botType === "single" ? "simple" : "composite",
      profit_currency: originalBot.profitCurrency,
      base_order_volume: originalBot.baseOrderSize,
      start_order_type: originalBot.startOrderType,
      take_profit_type: originalBot.takeProfitType,
      take_profit: originalBot.targetProfitPercent,
      safety_order_type: "market",
      safety_order_volume: originalBot.safetyOrderVolume,
      max_safety_orders: originalBot.maxSafetyOrders,
      safety_order_step_percentage: originalBot.safetyOrderStepPercentage,
      safety_order_volume_type: "quote_currency",
      max_active_deals: 1,
      active: false, // Start as paused
      martingale_volume_coefficient: 1.0,
      martingale_step_coefficient: 1.0,
      stop_loss_percentage: originalBot.stopLossPercentage,
      cooldown: originalBot.cooldown,
      btc_price_limit: 0,
      strategy_list: [],
      base_order_volume_type: "quote_currency",
      safety_order_volume_type: "quote_currency",
      note: `Bot duplicated from ${originalBot.name} for ${userId}`,
    };

    const path = "/ver1/bots";
    const payload = JSON.stringify(botPayload);
    const signature = createSignatureFromParts(path, "", payload);

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

      console.log("✅ 3Commas bot duplication successful:", response.data);
      threeCommasBotId = response.data.id;
      threeCommasResponse = response.data;
    } catch (error) {
      console.error("❌ 3Commas bot duplication failed:", error?.response?.data || error.message);
      return res.status(400).json({
        success: false,
        message: "Failed to duplicate bot in 3Commas",
        error: error?.response?.data || error.message,
      });
    }

    // Create new bot in MongoDB
    const newBot = new Bot({
      user: user._id,
      name: newName,
      exchangeId: user.threeCommasAccountId,
      pair: originalBot.pair,
      strategy: originalBot.strategy,
      botType: originalBot.botType,
      profitCurrency: originalBot.profitCurrency,
      baseOrderSize: originalBot.baseOrderSize,
      startOrderType: originalBot.startOrderType,
      takeProfitType: originalBot.takeProfitType,
      targetProfitPercent: originalBot.targetProfitPercent,
      safetyOrderVolume: originalBot.safetyOrderVolume,
      maxSafetyOrders: originalBot.maxSafetyOrders,
      safetyOrderStepPercentage: originalBot.safetyOrderStepPercentage,
      stopLossPercentage: originalBot.stopLossPercentage,
      cooldown: originalBot.cooldown,
      note: `Bot duplicated from ${originalBot.name} for ${userId}`,
      threeCommasBotId: threeCommasBotId,
      status: "paused", // Start as paused
      configVersion: originalBot.configVersion + 1
    });

    await newBot.save();

    res.status(201).json({
      success: true,
      message: "Bot duplicated successfully",
      originalBot: originalBot._id,
      newBot: newBot._id,
      threeCommasBotId: threeCommasBotId,
      bot: newBot,
      threeCommasData: threeCommasResponse,
    });
  } catch (error) {
    console.error("❌ Bot duplication failed:", error);
    res.status(500).json({
      success: false,
      message: "Bot duplication failed",
      error: error.message,
    });
  }
};
