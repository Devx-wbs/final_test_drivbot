const axios = require("axios");
const crypto = require("crypto");

const API_KEY = process.env.THREE_COMMAS_API_KEY;
const API_SECRET = process.env.THREE_COMMAS_API_SECRET;

function generateSignature(path, body = "") {
  const message = path + body;
  return crypto.createHmac("sha256", API_SECRET).update(message).digest("hex");
}

const threeCommas = axios.create({
  baseURL: "https://api.3commas.io/ver1",
});

threeCommas.interceptors.request.use((config) => {
  const urlObj = new URL(config.baseURL + config.url);
  const path = urlObj.pathname + urlObj.search;

  const body = config.data ? JSON.stringify(config.data) : "";

  const signature = generateSignature(path, body);

  config.headers["APIKEY"] = API_KEY;
  config.headers["Signature"] = signature;
  config.headers["Content-Type"] = "application/json";

  return config;
});

module.exports = threeCommas;
