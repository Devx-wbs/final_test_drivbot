const axios = require("axios");
const User = require("../models/User");
const { encrypt, decrypt } = require("../utils/encrypt");
const threeCommas = require("../utils/threeCommas");

// Helpers
async function verifyBinanceCredentials(apiKey, apiSecret) {
  const baseUrl = process.env.BINANCE_API_BASE_URL || "https://api.binance.com";
  const endpoint = "/api/v3/account";
  const timestamp = Date.now();
  const recvWindow = 5000;

  const params = new URLSearchParams({
    timestamp: String(timestamp),
    recvWindow: String(recvWindow),
  });

  const signature = require("crypto")
    .createHmac("sha256", apiSecret)
    .update(params.toString())
    .digest("hex");

  const url = `${baseUrl}${endpoint}?${params.toString()}&signature=${signature}`;

  try {
    await axios.get(url, {
      headers: { "X-MBX-APIKEY": apiKey },
      timeout: 15000,
    });
    return { ok: true };
  } catch (error) {
    const code = error?.response?.status || 0;
    const data = error?.response?.data;
    return {
      ok: false,
      message:
        data?.msg || error.message || "Failed to verify Binance credentials",
      status: code,
      data,
    };
  }
}

async function createThreeCommasExchangeAccount({
  name,
  apiKey,
  apiSecret,
  passphrase,
  typesToCreate,
}) {
  // 3Commas: create new exchange account. Endpoint commonly used:
  // POST /ver1/accounts/new
  // Body example for Binance: { name, type: "binance", api_key, secret, is_sandbox: false }
  try {
    const payload = {
      name: name || "Binance Account",
      type: "binance",
      api_key: apiKey,
      secret: apiSecret,
    };

    if (typeof passphrase === "string" && passphrase.length > 0) {
      payload.passphrase = passphrase;
    }
    if (Array.isArray(typesToCreate) && typesToCreate.length > 0) {
      payload.types_to_create = typesToCreate;
    }

    const response = await threeCommas.post("/ver1/accounts/new", payload, {
      timeout: 20000,
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const data = error?.response?.data;
    return {
      ok: false,
      status: error?.response?.status,
      error: data?.error,
      error_description: data?.error_description || error.message,
      error_attributes: data?.error_attributes,
      raw: data || null,
    };
  }
}

// Controllers
exports.connectBinance = async (req, res) => {
  const { userId, apiKey, apiSecret, passphrase, typesToCreate } =
    req.body || {};

  if (!userId || !apiKey || !apiSecret) {
    return res
      .status(400)
      .json({ message: "userId, apiKey and apiSecret are required" });
  }

  try {
    // 1) Verify Binance credentials
    const verify = await verifyBinanceCredentials(apiKey, apiSecret);
    if (!verify.ok) {
      return res
        .status(400)
        .json({ message: "Invalid Binance credentials", details: verify });
    }

    // 2) Encrypt and upsert in DB
    const encryptedKey = encrypt(apiKey);
    const encryptedSecret = encrypt(apiSecret);

    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId });
    }

    user.binanceApiKey = encryptedKey;
    user.binanceApiSecret = encryptedSecret;

    await user.save();

    // 3) Ensure exchange exists in centralized 3Commas account
    const name = `Binance-${userId.slice(-6)}`;
    const createAcc = await createThreeCommasExchangeAccount({
      name,
      apiKey,
      apiSecret,
      passphrase,
      typesToCreate,
    });

    if (!createAcc.ok) {
      // Keep credentials saved but report 3Commas failure
      return res.status(502).json({
        message: "Saved credentials, but failed to create 3Commas account",
        threeCommas: {
          status: createAcc.status,
          error: createAcc.error,
          error_description: createAcc.error_description,
          error_attributes: createAcc.error_attributes,
        },
      });
    }

    const accountId = createAcc.data?.id || createAcc.data?.account?.id;
    if (accountId) {
      user.threeCommasAccountId = accountId;
      await user.save();
    }

    return res.status(200).json({
      message: "Binance connected successfully",
      verified: true,
      threeCommasAccountId: user.threeCommasAccountId || null,
    });
  } catch (error) {
    console.error("connectBinance error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getBinanceStatus = async (req, res) => {
  const { userId } = req.query || {};
  if (!userId) return res.status(400).json({ message: "userId is required" });
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.json({ connected: false });
    const connected = Boolean(user.binanceApiKey && user.binanceApiSecret);
    res.json({
      connected,
      threeCommasAccountId: user.threeCommasAccountId || null,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.disconnectBinance = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId is required" });
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Optionally try to remove account from 3Commas if present
    if (user.threeCommasAccountId) {
      try {
        await threeCommas.delete(
          `/ver1/accounts/${user.threeCommasAccountId}`,
          { timeout: 20000 }
        );
      } catch (e) {
        // log only, proceed
        console.warn(
          "Failed to delete 3Commas account:",
          e?.response?.data || e.message
        );
      }
    }

    user.binanceApiKey = undefined;
    user.binanceApiSecret = undefined;
    user.threeCommasAccountId = undefined;
    await user.save();

    res.json({ message: "Disconnected successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getFullWalletInfo = async (_req, res) => {
  return res.status(501).json({ message: "Not implemented yet" });
};

exports.getTradeHistory = async (_req, res) => {
  return res.status(501).json({ message: "Not implemented yet" });
};

exports.getBinanceStats = async (_req, res) => {
  return res.status(501).json({ message: "Not implemented yet" });
};

exports.getSimpleWallet = async (_req, res) => {
  return res.status(501).json({ message: "Not implemented yet" });
};

exports.checkThreeCommasAccounts = async (_req, res) => {
  try {
    const response = await threeCommas.get("/ver1/accounts", {
      timeout: 20000,
    });
    res.json({
      total: Array.isArray(response.data) ? response.data.length : 0,
      accounts: response.data,
    });
  } catch (error) {
    res.status(502).json({
      message: "Failed to fetch 3Commas accounts",
      error: error?.response?.data || error.message,
    });
  }
};

exports.getAccountDetails = async (req, res) => {
  const { accountId } = req.params || {};
  if (!accountId)
    return res.status(400).json({ message: "accountId is required" });
  try {
    const response = await threeCommas.get(`/ver1/accounts/${accountId}`, {
      timeout: 20000,
    });
    res.json(response.data);
  } catch (error) {
    res.status(502).json({
      message: "Failed to fetch account details",
      error: error?.response?.data || error.message,
    });
  }
};

exports.testThreeCommasConnection = async (_req, res) => {
  try {
    const response = await threeCommas.get("/ver1/accounts", {
      timeout: 15000,
    });
    return res.json({
      ok: true,
      count: Array.isArray(response.data) ? response.data.length : 0,
    });
  } catch (error) {
    return res
      .status(502)
      .json({ ok: false, error: error?.response?.data || error.message });
  }
};
