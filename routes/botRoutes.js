const express = require("express");
const router = express.Router();

const botController = require("../controllers/botController");
const manageBotController = require("../controllers/manageBotController");

// Bot creation and management
router.post("/create", botController.createBot);
router.get("/user/:userId", manageBotController.getBotsByUserId);
router.post("/pause/:botId", manageBotController.pauseBot);
router.post("/start/:botId", manageBotController.startBot);
router.delete("/delete/:botId", manageBotController.deleteBot);

// Enhanced bot management routes
router.get("/stats/:botId?", botController.getBotStats);
router.patch("/update/:botId", botController.updateBot);
router.get("/performance/:botId", botController.getBotPerformance);
router.post("/duplicate/:botId", botController.duplicateBot);
router.get("/details/:botId", manageBotController.getBotDetails);
router.get("/summary", manageBotController.getBotSummary);

// 3Commas integration routes
router.get("/verify/:botId", botController.verifyBotCreation);
router.get("/list-3commas", botController.listThreeCommasBots);
router.get("/deals/:botId", botController.getBotDeals);
router.post("/emergency-stop/:botId", manageBotController.emergencyStopBot);

module.exports = router;
