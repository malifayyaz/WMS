const express = require("express");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", aiController.chat);
router.post("/agent-chat", aiController.agentChat);
router.post("/agent-execute", aiController.executeAgentAction);
router.post("/agent-undo", aiController.undoAgentAction);

module.exports = router;
