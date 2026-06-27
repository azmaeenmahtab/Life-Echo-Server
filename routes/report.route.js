const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");

router.post("/submit", reportController.submitReport);

module.exports = router;
