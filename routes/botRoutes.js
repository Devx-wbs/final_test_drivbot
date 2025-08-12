const express = require("express");
const router = express.Router();

const botController = require("../controllers/botController");
const manageBotController = require("../controllers/manageBotController");

router.post("/create", botController.createBot);
router.get("/user/:userId", manageBotController.getBotsByUserId);
router.post("/pause/:botId", manageBotController.pauseBot);
router.post("/start/:botId", manageBotController.startBot);
router.delete("/delete/:botId", manageBotController.deleteBot);

module.exports = router;
