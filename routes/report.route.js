const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");

router.post("/submit", reportController.submitReport);
router.get("/", reportController.getAllReports);
router.get("/count", reportController.getReportsCount);

module.exports = router;
