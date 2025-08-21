const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");

const API_KEY = process.env.THREE_COMMAS_API_KEY;
const API_SECRET = process.env.THREE_COMMAS_API_SECRET;

function generateSignature(fullPathWithPrefix, bodyString) {
  const message = `${fullPathWithPrefix}${bodyString || ""}`;
  return crypto.createHmac("sha256", API_SECRET).update(message).digest("hex");
}

const threeCommas = axios.create({
  // Must include /public/api so that the path used for the signature matches server expectation
  baseURL: config.threeCommas.baseUrl, // e.g., https://api.3commas.io/public/api
});

threeCommas.interceptors.request.use((reqConfig) => {
  const composedUrl = new URL(reqConfig.baseURL + reqConfig.url);
  const fullPath = composedUrl.pathname + composedUrl.search; // includes /public/api prefix

  const body = reqConfig.data ? JSON.stringify(reqConfig.data) : "";
  const signature = generateSignature(fullPath, body);

  reqConfig.headers["Apikey"] = API_KEY;
  reqConfig.headers["Signature"] = signature;
  reqConfig.headers["Content-Type"] = "application/json";

  return reqConfig;
});

module.exports = threeCommas;
