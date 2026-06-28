const express = require("express");
const {
  getDashboardStats,
  getDashboardActivity,
} = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/stats", getDashboardStats);
router.get("/activity", getDashboardActivity);

module.exports = router;
