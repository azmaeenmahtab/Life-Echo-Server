const reportService = require("../services/report.service");

const submitReport = async (req, res) => {
  try {
    const lessonId = req.query.lessonId || req.body?.lessonId;
    const userId = req.query.userId || req.body?.userId;
    const reason = req.body?.reason;

    if (!lessonId || !userId) {
      return res
        .status(400)
        .json({ message: "lessonId and userId are required" });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: "Reason cannot be empty" });
    }

    const { alreadyReported, report } = await reportService.createReport({
      lessonId,
      userId,
      reason,
    });

    // 200 for the "you've already reported this" case so the frontend
    // can show a friendly message without treating it as an error.
    if (alreadyReported) {
      return res.status(200).json({
        message: "You have already reported this lesson.",
        alreadyReported: true,
        report,
      });
    }

    return res.status(201).json({
      message: "Report submitted successfully",
      alreadyReported: false,
      report,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error submitting report" : error.message,
      error: error.message,
    });
  }
};

/**
 * Returns every report joined with the lesson + reporter info for
 * the admin "Reported Lessons" page. Newest first.
 */
const getAllReports = async (_req, res) => {
  try {
    const { total, reports } = await reportService.getAllReports();
    return res.status(200).json({ total, reports });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching reports",
      error: error.message,
    });
  }
};

/**
 * Returns the total number of reports. The admin dashboard's stat
 * card calls this so it doesn't have to materialise the full join.
 */
const getReportsCount = async (_req, res) => {
  try {
    const { total } = await reportService.getReportsCount();
    return res.status(200).json({ total });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching report count",
      error: error.message,
    });
  }
};

/**
 * Returns one row per reported lesson with the report count and the
 * unique set of recent reasons. Drives the admin reported-lessons
 * table.
 */
const getReportedLessonsGrouped = async (_req, res) => {
  try {
    const data = await reportService.getReportedLessonsGrouped();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Error fetching reported lessons",
      error: error.message,
    });
  }
};

/**
 * Returns the full list of reports for a single lesson, joined with
 * the lesson and reporter. Drives the "View reasons" modal.
 */
const getReportsForLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!lessonId) {
      return res.status(400).json({ message: "lessonId is required" });
    }
    const data = await reportService.getReportsForLesson({ lessonId });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Error fetching reports for lesson",
      error: error.message,
    });
  }
};

/**
 * Drops every report for the given lesson. The lesson itself is kept
 * intact — this is the "Ignore" admin action.
 */
const ignoreLessonReports = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!lessonId) {
      return res.status(400).json({ message: "lessonId is required" });
    }
    const result = await reportService.ignoreLessonReportsService({
      lessonId,
    });
    return res.status(200).json({
      message: "Reports ignored successfully.",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Error ignoring reports",
      error: error.message,
    });
  }
};

module.exports = {
  submitReport,
  getAllReports,
  getReportsCount,
  getReportedLessonsGrouped,
  getReportsForLesson,
  ignoreLessonReports,
};
