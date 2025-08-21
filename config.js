require("dotenv").config();

const config = {
  // MongoDB Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/drivbots",
  },

  // 3Commas API Configuration
  threeCommas: {
    apiKey: process.env.THREE_COMMAS_API_KEY,
    apiSecret: process.env.THREE_COMMAS_API_SECRET,
    baseUrl: "https://api.3commas.io/public/api",
    apiPrefix: "/public/api",
    defaultAccountId: process.env.THREE_COMMAS_ACCOUNT_ID,
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || "development",
  },

  // Validation
  validate: function () {
    const errors = [];

    if (!process.env.ENCRYPT_SECRET || !process.env.ENCRYPT_IV) {
      errors.push("ENCRYPT_SECRET and ENCRYPT_IV are required for encryption");
    }

    if (!this.threeCommas.apiKey) {
      errors.push("THREE_COMMAS_API_KEY is required");
    }

    if (!this.threeCommas.apiSecret) {
      errors.push("THREE_COMMAS_API_SECRET is required");
    }

    if (!this.mongodb.uri) {
      errors.push("MONGODB_URI is required");
    }

    if (errors.length > 0) {
      console.error("❌ Configuration errors:");
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }

    console.log("✅ Configuration validated successfully");
  },
};

// Validate configuration on startup
if (require.main === module) {
  config.validate();
}

module.exports = config;
