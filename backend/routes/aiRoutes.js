const express = require("express");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", aiController.chat);
router.get("/daily-summary", aiController.getDailySummary);
router.get("/predict-profit", aiController.predictProfit);
router.post("/parse-order", aiController.parseOrder);

module.exports = router;
