const lessonService = require('../services/lesson.service');

/**
 * Controller layer: shapes the HTTP request into a service call and the
 * response back to the client. Domain errors carry `statusCode` so we can
 * forward the right HTTP code without leaking internals.
 */

const createLesson = async (req, res) => {
  try {
    const lesson = await lessonService.createLesson(req.body);
    return res.status(201).json({
      message: 'Lesson created successfully',
      lesson,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? 'Error creating lesson' : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  createLesson,
};
