const express = require("express");
const aiController = require("../controllers/aiController");
const { blockViewer } = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/chat", aiController.chat);
router.post("/agent-chat", blockViewer, aiController.agentChat);
router.post("/agent-execute", blockViewer, aiController.executeAgentAction);
router.post("/agent-undo", blockViewer, aiController.undoAgentAction);
router.get("/daily-summary", aiController.getDailySummary);
router.get("/predict-profit", aiController.predictProfit);
router.post("/parse-order", aiController.parseOrder);

module.exports = router;
