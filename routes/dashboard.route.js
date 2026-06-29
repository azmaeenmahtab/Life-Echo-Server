const express = require("express");
const { verifyJWT } = require("../middleware/authMiddleware");
const {
  getDashboardStats,
  getDashboardActivity,
} = require("../controllers/dashboard.controller");
const {
  getTopContributors,
  getTodaysLessons,
  getLessonGrowth,
  getUserGrowth,
  getTopWeeklyContributors,
  getMostSavedLessons,
} = require("../controllers/admin.controller");

const router = express.Router();

// All dashboard routes require an authenticated session. The
// controllers are responsible for any additional role checks
// (e.g. admin-only endpoints).

router.get("/stats", verifyJWT, getDashboardStats);
router.get("/activity", verifyJWT, getDashboardActivity);

// Admin-only: ranked list of users by lessons authored. Used by the
// "Most active contributors" card on /dashboard/admin.
router.get("/top-contributors", verifyJWT, getTopContributors);

// Home page: "Top Contributors of the Week" section.
router.get("/top-weekly-contributors", verifyJWT, getTopWeeklyContributors);

// Home page: "Community Favorites" (most saved) section.
router.get("/most-saved-lessons", verifyJWT, getMostSavedLessons);

// Admin-only: lessons authored in the last 24 hours, plus a count.
// Drives the "Today's new lessons" card on /dashboard/admin.
router.get("/today-lessons", verifyJWT, getTodaysLessons);

// Admin-only: cumulative lesson count bucketed by day for the last
// `days` days. Drives the "Lesson growth" line chart on
// /dashboard/admin.
router.get("/lesson-growth", verifyJWT, getLessonGrowth);

// Admin-only: cumulative user signup count bucketed by day for the
// last `days` days. Drives the "User growth" line chart on
// /dashboard/admin.
router.get("/user-growth", verifyJWT, getUserGrowth);

module.exports = router;
