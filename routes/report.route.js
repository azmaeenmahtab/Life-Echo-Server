const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");

router.post("/submit", reportController.submitReport);
router.get("/", reportController.getAllReports);
router.get("/count", reportController.getReportsCount);

// Per-lesson grouped listing. Drives the admin "Reported lessons" table.
router.get("/lessons", reportController.getReportedLessonsGrouped);

// Full report list for one lesson. Drives the "View reasons" modal.
router.get("/lessons/:lessonId", reportController.getReportsForLesson);

// Ignore / clear reports for a lesson (drops reports, keeps the lesson).
router.delete("/lessons/:lessonId", reportController.ignoreLessonReports);

module.exports = router;
