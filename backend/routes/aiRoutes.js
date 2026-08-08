const express = require("express");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", aiController.chat);
router.post("/agent-chat", aiController.agentChat);
router.post("/agent-execute", aiController.executeAgentAction);
router.post("/agent-undo", aiController.undoAgentAction);
router.get("/daily-summary", aiController.getDailySummary);
router.get("/predict-profit", aiController.predictProfit);
router.post("/parse-order", aiController.parseOrder);

module.exports = router;
