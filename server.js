const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
const binanceRoutes = require("./routes/binanceRoutes");
const botRoutes = require("./routes/botRoutes");

app.use("/api/binance", binanceRoutes);
app.use("/scripts", express.static(path.join(__dirname, "public/scripts")));
app.use("/api/bots", botRoutes);

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
