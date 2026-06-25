const lessonService = require("../services/lesson.service");

/**
 * Controller layer: shapes the HTTP request into a service call and the
 * response back to the client. Domain errors carry `statusCode` so we can
 * forward the right HTTP code without leaking internals.
 */

const createLesson = async (req, res) => {
  try {
    const lesson = await lessonService.createLesson(req.body);
    return res.status(201).json({
      message: "Lesson created successfully",
      lesson,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error creating lesson" : error.message,
      error: error.message,
    });
  }
};

const getPublicLessons = async (req, res) => {
  try {
    console.log("request queries : ", req.query);
    const lessons = await lessonService.getPublicLessons(req.query);
    return res.status(200).json({
      message: "Public lessons fetched successfully",
      count: lessons.length,
      lessons,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error fetching lessons" : error.message,
      error: error.message,
    });
  }
};

const getLessonById = async (req, res) => {
  try {
    const lesson = await lessonService.getLessonByIdService(req.params.id);
    return res.status(200).json({
      message: "Lesson fetched successfully",
      lesson,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error fetching lesson" : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  createLesson,
  getPublicLessons,
  getLessonById,
};
