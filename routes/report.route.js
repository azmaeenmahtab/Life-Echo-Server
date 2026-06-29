const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/authMiddleware");

const reportController = require("../controllers/report.controller");

// Logged-in users report lessons.
router.post("/submit", verifyJWT, reportController.submitReport);

// Admin-only reads / writes. verifyJWT ensures a valid session; an
// additional role check (e.g. "admin") should live in the controllers.
router.get("/", verifyJWT, reportController.getAllReports);
router.get("/count", verifyJWT, reportController.getReportsCount);

// Per-lesson grouped listing. Drives the admin "Reported lessons" table.
router.get("/lessons", verifyJWT, reportController.getReportedLessonsGrouped);

// Full report list for one lesson. Drives the "View reasons" modal.
router.get(
  "/lessons/:lessonId",
  verifyJWT,
  reportController.getReportsForLesson,
);

// Ignore / clear reports for a lesson (drops reports, keeps the lesson).
router.delete(
  "/lessons/:lessonId",
  verifyJWT,
  reportController.ignoreLessonReports,
);

module.exports = router;
