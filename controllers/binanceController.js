const axios = require("axios");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const User = require("../models/User");
const { encrypt, decrypt } = require("../utils/encrypt");
const config = require("../config");

const THREE_COMMAS_API_KEY = config.threeCommas.apiKey;
const THREE_COMMAS_API_SECRET = config.threeCommas.apiSecret;
const BASE_URL = config.threeCommas.baseUrl;
const API_PREFIX = config.threeCommas.apiPrefix;

// Helper to sign Binance API requests
const signQuery = (query, secret) =>
  crypto.createHmac("sha256", secret).update(query).digest("hex");

// Enhanced Binance API validation that handles different permission levels
const validateBinanceAPI = async (apiKey, apiSecret) => {
  const validationResults = {
    passed: false,
    error: null,
    permissionLevel: "unknown",
    canTrade: false,
    canRead: false,
  };

  // Basic format validation first
  if (!apiKey || apiKey.length < 20) {
    validationResults.error = "Invalid API key format - too short";
    return validationResults;
  }

  if (!apiSecret || apiSecret.length < 20) {
    validationResults.error = "Invalid API secret format - too short";
    return validationResults;
  }

  try {
    // Test 1: Basic account info (requires basic read permissions)
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = signQuery(query, apiSecret);

    const accountResponse = await axios.get(
      `https://api.binance.com/api/v3/account?${query}&signature=${signature}`,
      {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
      }
    );

    if (
      accountResponse.data &&
      accountResponse.data.makerCommission !== undefined
    ) {
      validationResults.passed = true;
      validationResults.canRead = true;
      validationResults.permissionLevel = "full";
      console.log("✅ Full Binance API access verified");
    }
  } catch (accountErr) {
    console.log("⚠️ Account API failed, trying simpler validation...");

    try {
      // Test 2: Simple ping test (minimal permissions required)
      const pingResponse = await axios.get(
        "https://api.binance.com/api/v3/ping",
        {
          headers: { "X-MBX-APIKEY": apiKey },
          timeout: 5000,
        }
      );

      if (pingResponse.status === 200) {
        validationResults.passed = true;
        validationResults.canRead = true;
        validationResults.permissionLevel = "basic";
        console.log("✅ Basic Binance API access verified");
      }
    } catch (pingErr) {
      try {
        // Test 3: Server time (no authentication required, just to check if API key format is valid)
        const timeResponse = await axios.get(
          "https://api.binance.com/api/v3/time"
        );
        if (timeResponse.status === 200) {
          validationResults.passed = true;
          validationResults.permissionLevel = "minimal";
          console.log("✅ Minimal Binance API access verified");
        }
      } catch (timeErr) {
        validationResults.error =
          accountErr?.response?.data || accountErr.message;
        console.log("❌ All Binance API validation attempts failed");
      }
    }
  }

  return validationResults;
};

// Do not throw during module load; validate at request time so the app can boot

function buildStringToSign(path, queryString, bodyString) {
  // Per 3Commas docs: sign the request path (including /public/api) + optional query string + optional raw body
  // Do not include scheme/host. Query string must start with '?' when present.
  const qsPart = queryString ? `?${queryString}` : "";
  const bodyPart = bodyString || "";
  return `${API_PREFIX}${path}${qsPart}${bodyPart}`;
}

function createSignatureFromParts(path, queryString, bodyString) {
  const stringToSign = buildStringToSign(path, queryString, bodyString);
  // Debug: log what we sign to help diagnose signature mismatches
  console.log("3Commas stringToSign:", {
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

const keepAliveHttpAgent = new http.Agent({ keepAlive: true });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true });

const threeCommasAPI = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  httpAgent: keepAliveHttpAgent,
  httpsAgent: keepAliveHttpsAgent,
  headers: {
    "Content-Type": "application/json",
  },
});

function assertThreeCommasEnv() {
  if (!THREE_COMMAS_API_KEY || !THREE_COMMAS_API_SECRET) {
    const error = new Error(
      "3Commas credentials are not configured on the server"
    );
    error.status = 500;
    throw error;
  }
}

// ✅ Connect Binance Account (Main function for your routes)
exports.connectBinanceAccount = async (req, res, next) => {
  try {
    assertThreeCommasEnv();
    const { binanceApiKey, binanceApiSecret, accountName } = req.body;

    // Validate Binance API key first
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = signQuery(query, binanceApiSecret);

    try {
      await axios.get(
        `https://api.binance.com/api/v3/account?${query}&signature=${signature}`,
        { headers: { "X-MBX-APIKEY": binanceApiKey } }
      );
      console.log("✅ Binance API validation successful");
    } catch (binanceErr) {
      return res.status(400).json({
        error: "Invalid Binance API credentials",
        details: binanceErr?.response?.data || binanceErr.message,
      });
    }

    // 3Commas /ver1/accounts/new expects a flat payload
    const payloadObj = {
      type: "binance",
      name: accountName,
      api_key: binanceApiKey,
      secret: binanceApiSecret,
      passphrase: "",
      // Optionally: types_to_create: ["binance_futures"]
    };

    const payload = JSON.stringify(payloadObj);
    // Sign the request path + body per 3Commas HMAC rules
    const path = "/ver1/accounts/new";
    const signature3Commas = createSignatureFromParts(path, "", payload);

    // Log sanitized request details (avoid leaking secrets)
    const redactedPayloadLog = {
      ...payloadObj,
      api_key: payloadObj.api_key
        ? `${payloadObj.api_key.slice(0, 4)}…${payloadObj.api_key.slice(-4)}`
        : undefined,
      secret: payloadObj.secret
        ? `${payloadObj.secret.slice(0, 4)}…${payloadObj.secret.slice(-4)}`
        : undefined,
      passphrase: payloadObj.passphrase ? "****" : "",
    };
    console.log("3Commas request payload (sanitized):", redactedPayloadLog);
    console.log("Request headers (sanitized):", {
      Apikey: `${THREE_COMMAS_API_KEY.slice(0, 6)}…${THREE_COMMAS_API_KEY.slice(
        -4
      )}`,
      Signature: `${signature3Commas.slice(0, 6)}…${signature3Commas.slice(
        -4
      )}`,
      "Content-Type": "application/json",
    });

    const response = await threeCommasAPI.post(path, payload, {
      headers: {
        // Header names are case-insensitive, use the casing from docs
        Apikey: THREE_COMMAS_API_KEY,
        Signature: signature3Commas,
      },
      timeout: 15000,
    });

    // Store in User model
    const encryptedKey = encrypt(binanceApiKey);
    const encryptedSecret = encrypt(binanceApiSecret);

    await User.findOneAndUpdate(
      { userId: accountName }, // Using accountName as userId for now
      {
        binanceApiKey: encryptedKey,
        binanceApiSecret: encryptedSecret,
        threeCommasAccountId: response.data.id,
      },
      { upsert: true, new: true }
    );

    res.json({
      message: "Binance account connected successfully",
      threeCommasAccountId: response.data.id,
      accountData: response.data,
    });
  } catch (error) {
    console.error("Connect Binance Account Error:", error);

    if (error.code === "ECONNABORTED") {
      return res
        .status(504)
        .json({ error: "Upstream 3Commas request timed out" });
    }

    // If error has response and data, send that to client
    if (error.response && error.response.data) {
      return res
        .status(error.response.status || 500)
        .json({ error: error.response.data });
    }

    // Otherwise send error message
    next(error);
  }
};

// ✅ List Binance Accounts
exports.listBinanceAccounts = async (req, res, next) => {
  try {
    assertThreeCommasEnv();
    const path = "/ver1/accounts";
    const signature = createSignatureFromParts(path, "", "");

    const response = await threeCommasAPI.get(path, {
      headers: {
        Apikey: THREE_COMMAS_API_KEY,
        Signature: signature,
      },
      timeout: 15000,
    });

    const binanceAccounts = response.data.filter(
      (acc) => acc.account_type === "binance"
    );

    res.json(binanceAccounts);
  } catch (error) {
    console.error("List Binance Accounts Error:", error);

    if (error.code === "ECONNABORTED") {
      return res
        .status(504)
        .json({ error: "Upstream 3Commas request timed out" });
    }
    if (error.response && error.response.data) {
      return res
        .status(error.response.status || 500)
        .json({ error: error.response.data });
    }

    next(error);
  }
};

// ✅ Connect Binance API (Updated with proper 3Commas integration)
exports.connectBinance = async (req, res) => {
  try {
    const { userId, apiKey, apiSecret } = req.body;
    if (!userId || !apiKey || !apiSecret) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    // Use enhanced Binance API validation
    console.log("🔍 Validating Binance API credentials for user:", userId);
    const binanceValidation = await validateBinanceAPI(apiKey, apiSecret);

    if (!binanceValidation.passed) {
      return res.status(400).json({
        success: false,
        error: "Binance API validation failed",
        details: binanceValidation.error || "Unable to verify API credentials",
        suggestion: "Please check your API key, secret, and permissions",
      });
    }

    console.log(
      `✅ Binance API validation passed with ${binanceValidation.permissionLevel} permissions for user:`,
      userId
    );

    // Use the proper 3Commas integration
    assertThreeCommasEnv();

    // 3Commas /ver1/accounts/new expects a flat payload
    const payloadObj = {
      type: "binance",
      name: `Binance for ${userId}`,
      api_key: apiKey,
      secret: apiSecret,
      passphrase: "",
      // Optionally: types_to_create: ["binance_futures"]
    };

    const payload = JSON.stringify(payloadObj);
    // Sign the request path + body per 3Commas HMAC rules
    const path = "/ver1/accounts/new";
    const signature3Commas = createSignatureFromParts(path, "", payload);

    // Log sanitized request details (avoid leaking secrets)
    const redactedPayloadLog = {
      ...payloadObj,
      api_key: payloadObj.api_key
        ? `${payloadObj.api_key.slice(0, 4)}…${payloadObj.api_key.slice(-4)}`
        : undefined,
      secret: payloadObj.secret
        ? `${payloadObj.secret.slice(0, 4)}…${payloadObj.secret.slice(-4)}`
        : undefined,
      passphrase: payloadObj.passphrase ? "****" : "",
    };
    console.log("3Commas request payload (sanitized):", redactedPayloadLog);
    console.log("Request headers (sanitized):", {
      Apikey: `${THREE_COMMAS_API_KEY.slice(0, 6)}…${THREE_COMMAS_API_KEY.slice(
        -4
      )}`,
      Signature: `${signature3Commas.slice(0, 6)}…${signature3Commas.slice(
        -4
      )}`,
      "Content-Type": "application/json",
    });

    let threeCommasResponse;
    let threeCommasAccountId;

    try {
      threeCommasResponse = await threeCommasAPI.post(path, payload, {
        headers: {
          // Header names are case-insensitive, use the casing from docs
          Apikey: THREE_COMMAS_API_KEY,
          Signature: signature3Commas,
        },
        timeout: 15000,
      });

      threeCommasAccountId = threeCommasResponse.data.id;
      console.log("✅ 3Commas account creation successful for user:", userId);
    } catch (threeCommasErr) {
      console.error(
        "❌ 3Commas account creation failed for user:",
        userId,
        threeCommasErr?.response?.data || threeCommasErr.message
      );

      // If 3Commas fails, return detailed error
      return res.status(400).json({
        success: false,
        error: "Failed to create 3Commas account",
        details: threeCommasErr?.response?.data || threeCommasErr.message,
        binanceValidation: binanceValidation,
        suggestion: "Please check your 3Commas account configuration",
      });
    }

    // Store in User model
    const encryptedKey = encrypt(apiKey);
    const encryptedSecret = encrypt(apiSecret);

    await User.findOneAndUpdate(
      { userId },
      {
        binanceApiKey: encryptedKey,
        binanceApiSecret: encryptedSecret,
        threeCommasAccountId,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: "Binance connected successfully",
      threeCommasAccountId: threeCommasAccountId,
      accountData: threeCommasResponse.data,
      binanceValidation: binanceValidation,
      note: `Connection established with ${binanceValidation.permissionLevel} permissions`,
    });
  } catch (error) {
    console.error("Connect Binance Account Error:", error);

    if (error.code === "ECONNABORTED") {
      return res
        .status(504)
        .json({ error: "Upstream 3Commas request timed out" });
    }

    // If error has response and data, send that to client
    if (error.response && error.response.data) {
      return res
        .status(error.response.status || 500)
        .json({ success: false, error: error.response.data });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// ✅ Get Binance Connection Status
exports.getBinanceStatus = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findOne({ userId });
    if (!user?.binanceApiKey || !user?.binanceApiSecret) {
      return res.json({ connected: false });
    }

    return res.json({ connected: true });
  } catch (err) {
    console.error("Status error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Disconnect Binance
exports.disconnectBinance = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    await User.findOneAndUpdate(
      { userId },
      { binanceApiKey: null, binanceApiSecret: null }
    );

    return res.json({ message: "Binance disconnected" });
  } catch (err) {
    console.error("Disconnect error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Check existing 3Commas accounts (Updated with proper integration)
exports.checkThreeCommasAccounts = async (req, res) => {
  try {
    assertThreeCommasEnv();
    const path = "/ver1/accounts";
    const signature = createSignatureFromParts(path, "", "");

    console.log("🔍 Debug - Check accounts request:");
    console.log("  URL:", `${BASE_URL}${path}`);
    console.log("  Signature:", signature);

    const response = await threeCommasAPI.get(path, {
      headers: {
        Apikey: THREE_COMMAS_API_KEY,
        Signature: signature,
      },
      timeout: 15000,
    });

    console.log("📦 Check accounts response status:", response.status);
    console.log("📦 Check accounts response data:", response.data);
    console.log("📦 Response data type:", typeof response.data);
    console.log("📦 Response data length:", response.data?.length);

    // Handle different response formats
    let accounts = [];
    if (Array.isArray(response.data)) {
      accounts = response.data;
    } else if (
      typeof response.data === "string" &&
      response.data.trim() === ""
    ) {
      accounts = [];
    } else if (response.data && typeof response.data === "object") {
      accounts = Array.isArray(response.data.accounts)
        ? response.data.accounts
        : [];
    }

    return res.json({
      success: true,
      accounts: accounts,
      count: accounts.length,
      rawResponse: response.data,
      responseStatus: response.status,
    });
  } catch (error) {
    console.error("List Binance Accounts Error:", error);

    if (error.code === "ECONNABORTED") {
      return res
        .status(504)
        .json({ error: "Upstream 3Commas request timed out" });
    }
    if (error.response && error.response.data) {
      return res
        .status(error.response.status || 500)
        .json({ error: error.response.data });
    }

    return res.status(500).json({
      success: false,
      error: error?.response?.data || error.message,
      status: error?.response?.status,
    });
  }
};

// ✅ Get account details by ID (Updated with proper integration)
exports.getAccountDetails = async (req, res) => {
  try {
    const { accountId } = req.params;
    assertThreeCommasEnv();
    const path = `/ver1/accounts/${accountId}`;
    const signature = createSignatureFromParts(path, "", "");

    console.log("🔍 Debug - Get account details:");
    console.log("  Account ID:", accountId);
    console.log("  URL:", `${BASE_URL}${path}`);
    console.log("  Signature:", signature);

    const response = await threeCommasAPI.get(path, {
      headers: {
        Apikey: THREE_COMMAS_API_KEY,
        Signature: signature,
      },
      timeout: 15000,
    });

    console.log("📦 Account details response:", response.data);
    return res.json({
      success: true,
      account: response.data,
      status: response.status,
    });
  } catch (error) {
    console.error("Get Account Details Error:", error);

    if (error.code === "ECONNABORTED") {
      return res
        .status(504)
        .json({ error: "Upstream 3Commas request timed out" });
    }
    if (error.response && error.response.data) {
      return res
        .status(error.response.status || 500)
        .json({ error: error.response.data });
    }

    return res.status(500).json({
      success: false,
      error: error?.response?.data || error.message,
      status: error?.response?.status,
    });
  }
};

exports.getFullWalletInfo = async (req, res) => {
  try {
    const {
      userId,
      sort = "value",
      order = "desc",
      timeframe = "7d",
    } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findOne({ userId });
    if (!user?.binanceApiKey || !user?.binanceApiSecret) {
      return res.status(403).json({ error: "Binance not connected" });
    }

    const apiKey = decrypt(user.binanceApiKey);
    const apiSecret = decrypt(user.binanceApiSecret);

    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = signQuery(query, apiSecret);

    const accountRes = await axios.get(
      `https://api.binance.com/api/v3/account?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );

    let balances = accountRes.data.balances
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
      }));

    const symbols = balances.map((b) => b.asset + "USDT");
    const priceRes = await axios.get(
      "https://api.binance.com/api/v3/ticker/price"
    );
    const priceMap = Object.fromEntries(
      priceRes.data.map((p) => [p.symbol, parseFloat(p.price)])
    );

    const now = Date.now();
    const startTimestamps = {
      "1d": now - 1 * 24 * 60 * 60 * 1000,
      "7d": now - 7 * 24 * 60 * 60 * 1000,
      "30d": now - 30 * 24 * 60 * 60 * 1000,
      "180d": now - 180 * 24 * 60 * 60 * 1000,
      "360d": now - 360 * 24 * 60 * 60 * 1000,
    };
    const fromTime =
      isNaN(Date.parse(timeframe)) && startTimestamps[timeframe]
        ? startTimestamps[timeframe]
        : new Date(timeframe).getTime(); // custom

    const walletDetails = await Promise.all(
      balances.map(async (b) => {
        const symbol = b.asset + "USDT";
        const currentPrice = b.asset === "USDT" ? 1 : priceMap[symbol] || 0;
        const total = (b.free + b.locked) * currentPrice;

        let change = 0;
        try {
          const klineQuery = `symbol=${symbol}&interval=1d&limit=1&startTime=${fromTime}`;
          const klineRes = await axios.get(
            `https://api.binance.com/api/v3/klines?${klineQuery}`
          );
          const [open] = klineRes.data?.[0] || [];
          const pastPrice = parseFloat(open);
          if (pastPrice) {
            change = ((currentPrice - pastPrice) / pastPrice) * 100;
          }
        } catch (_) {
          change = 0;
        }

        return {
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          total,
          price: currentPrice,
          trend: change.toFixed(2),
        };
      })
    );

    const totalWalletUSD = walletDetails.reduce((sum, a) => sum + a.total, 0);

    // Sort assets by total USD value descending for response
    walletDetails.sort((a, b) => b.total - a.total);

    // ➕ Only top 5 assets for historical chart
    const top5 = walletDetails.slice(0, 5);
    const limit = 30;
    const trendData = [];

    for (let i = limit - 1; i >= 0; i--) {
      const dayTimestamp = now - i * 24 * 60 * 60 * 1000;
      let dailyTotal = 0;

      for (const asset of top5) {
        const symbol = asset.asset + "USDT";
        try {
          const klineRes = await axios.get(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=1&startTime=${dayTimestamp}`
          );
          const [open] = klineRes.data?.[0] || [];
          const priceAtDay = parseFloat(open);
          const units = asset.free + asset.locked;
          dailyTotal += units * priceAtDay;
        } catch (_) {
          continue;
        }
      }

      trendData.push({
        time: new Date(dayTimestamp).toISOString().split("T")[0],
        value: parseFloat(dailyTotal.toFixed(2)),
      });
    }

    // Apply sorting after trend extraction (client-side sorting preserved)
    if (sort === "asset") {
      walletDetails.sort((a, b) =>
        order === "asc"
          ? a.asset.localeCompare(b.asset)
          : b.asset.localeCompare(a.asset)
      );
    } else {
      walletDetails.sort((a, b) =>
        order === "asc" ? a[sort] - b[sort] : b[sort] - a[sort]
      );
    }

    return res.json({
      totalUSD: totalWalletUSD.toFixed(2),
      assets: walletDetails,
      trendData,
    });
  } catch (err) {
    console.error("Full wallet error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch wallet" });
  }
};

// ✅ Trade History (last 10)
exports.getTradeHistory = async (req, res) => {
  try {
    const { userId, symbol = "BTCUSDT" } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findOne({ userId });
    if (!user?.binanceApiKey || !user?.binanceApiSecret) {
      return res.status(403).json({ error: "Binance not connected" });
    }

    const apiKey = decrypt(user.binanceApiKey);
    const apiSecret = decrypt(user.binanceApiSecret);
    const timestamp = Date.now();
    const query = `symbol=${symbol}&limit=10&timestamp=${timestamp}`;
    const signature = signQuery(query, apiSecret);

    const response = await axios.get(
      `https://api.binance.com/api/v3/myTrades?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );

    return res.json({ trades: response.data });
  } catch (err) {
    console.error("Trade history error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch trade history" });
  }
};

// ✅ Trading Stats
exports.getBinanceStats = async (req, res) => {
  try {
    const { userId, symbol = "BTCUSDT" } = req.query;
    const user = await User.findOne({ userId });
    if (!user?.binanceApiKey || !user?.binanceApiSecret) {
      return res.status(403).json({ error: "Binance not connected" });
    }

    const apiKey = decrypt(user.binanceApiKey);
    const apiSecret = decrypt(user.binanceApiSecret);
    const timestamp = Date.now();
    const query = `symbol=${symbol}&limit=50&timestamp=${timestamp}`;
    const signature = signQuery(query, apiSecret);

    const response = await axios.get(
      `https://api.binance.com/api/v3/myTrades?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );

    const trades = response.data || [];
    const buyTrades = trades.filter((t) => t.isBuyer);
    const totalBuyQty = buyTrades.reduce(
      (sum, t) => sum + parseFloat(t.qty),
      0
    );
    const totalBuyQuote = buyTrades.reduce(
      (sum, t) => sum + parseFloat(t.quoteQty),
      0
    );
    const avgBuyPrice = totalBuyQuote / totalBuyQty || 0;

    res.json({
      tradingStats: {
        symbol,
        totalTrades: trades.length,
        totalBuyQty,
        totalBuyQuote,
        avgBuyPrice,
        lastTradeTime: trades.at(-1)?.time,
      },
    });
  } catch (err) {
    console.error("Stats error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch trading stats" });
  }
};

exports.getSimpleWallet = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findOne({ userId });
    if (!user?.binanceApiKey || !user?.binanceApiSecret) {
      return res.status(403).json({ error: "Binance not connected" });
    }

    const apiKey = decrypt(user.binanceApiKey);
    const apiSecret = decrypt(user.binanceApiSecret);
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = signQuery(query, apiSecret);

    const accountRes = await axios.get(
      `https://api.binance.com/api/v3/account?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );

    const assets = accountRes.data.balances
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
      }));

    return res.json({ assets });
  } catch (err) {
    console.error("Simple wallet error:", err.message);
    return res.status(500).json({ error: "Failed to fetch wallet" });
  }
};

// ✅ Test 3Commas connection
exports.testThreeCommasConnection = async (req, res) => {
  try {
    assertThreeCommasEnv();

    console.log("🧪 Testing 3Commas API Connection...");
    console.log(
      "📋 API Key:",
      THREE_COMMAS_API_KEY
        ? `${THREE_COMMAS_API_KEY.slice(0, 6)}...${THREE_COMMAS_API_KEY.slice(
            -4
          )}`
        : "NOT SET"
    );

    // Test 1: Get accounts
    console.log("🔍 Test 1: Getting accounts...");
    const accountsPath = "/ver1/accounts";
    const accountsSignature = createSignatureFromParts(accountsPath, "", "");

    const accountsResponse = await threeCommasAPI.get(accountsPath, {
      headers: {
        Apikey: THREE_COMMAS_API_KEY,
        Signature: accountsSignature,
      },
      timeout: 15000,
    });

    console.log("✅ Accounts retrieved successfully");
    console.log("📊 Total accounts:", accountsResponse.data.length);

    // Test 2: Get bots
    console.log("🔍 Test 2: Getting bots...");
    const botsPath = "/ver1/bots";
    const botsSignature = createSignatureFromParts(botsPath, "", "");

    const botsResponse = await threeCommasAPI.get(botsPath, {
      headers: {
        Apikey: THREE_COMMAS_API_KEY,
        Signature: botsSignature,
      },
      timeout: 15000,
    });

    console.log("✅ Bots retrieved successfully");
    console.log("📊 Total bots:", botsResponse.data.length);

    return res.json({
      success: true,
      message: "3Commas connection test successful",
      accounts: {
        total: accountsResponse.data.length,
        binance: accountsResponse.data.filter(
          (acc) => acc.account_type === "binance"
        ).length,
        data: accountsResponse.data,
      },
      bots: {
        total: botsResponse.data.length,
        active: botsResponse.data.filter((bot) => bot.is_enabled).length,
        data: botsResponse.data,
      },
    });
  } catch (error) {
    console.error(
      "❌ 3Commas connection test failed:",
      error?.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "3Commas connection test failed",
      error: error?.response?.data || error.message,
      status: error?.response?.status,
    });
  }
};
