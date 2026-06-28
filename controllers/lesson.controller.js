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

const getLessonsByUserId = async (req, res) => {
  try {
    const lessons = await lessonService.getLessonsByUserId(req.params.userId);
    return res.status(200).json({
      message: "User lessons fetched successfully",
      count: lessons.length,
      lessons,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error fetching user lessons" : error.message,
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

/**
 * POST /api/lessons/:id/like
 * Body: { userId }
 *
 * Idempotent toggle: first call likes, second call unlikes. The service
 * is the source of truth for the resulting `isLiked` / `likesCount` /
 * `action` so the UI can reconcile optimistic state on success.
 */
const toggleLikeLesson = async (req, res) => {
  try {
    const result = await lessonService.toggleLikeLesson({
      lessonId: req.params.id,
      userId: req.body?.userId,
    });
    return res.status(200).json({
      message:
        result.action === "like"
          ? "Lesson liked successfully"
          : "Lesson unliked successfully",
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error toggling lesson like" : error.message,
      error: error.message,
    });
  }
};

/**
 * POST /api/lessons/:id/save
 * Body: { userId }
 *
 * Idempotent toggle: first call saves (bookmarks), second call unsaves.
 * Same response contract shape as like so the frontend can use a single
 * generic handler for both verbs.
 */
const toggleSaveLesson = async (req, res) => {
  try {
    const result = await lessonService.toggleSaveLesson({
      lessonId: req.params.id,
      userId: req.body?.userId,
    });
    return res.status(200).json({
      message:
        result.action === "save"
          ? "Lesson saved successfully"
          : "Lesson unsaved successfully",
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error toggling lesson save" : error.message,
      error: error.message,
    });
  }
};

const changeVisibilityController = async (req, res) => {
  try {
    const { id: lessonId } = req.params;
    const { visibility, userId } = req.body;

    const result = await lessonService.changeVisibilityService({
      lessonId,
      userId,
      visibility,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error changing visibility" : error.message,
      error: error.message,
    });
  }
};

const changeAccessLevelController = async (req, res) => {
  try {
    const { id: lessonId } = req.params;
    const { accessLevel, userId } = req.body;

    const result = await lessonService.changeAccessLevelService({
      lessonId,
      userId,
      accessLevel,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error changing access level" : error.message,
      error: error.message,
    });
  }
};

/**
 * PUT /api/lessons/:id
 * Body: { userId, title?, story?, category?, emotionalTone?, imageUrl?, accessLevel? }
 *
 * The owner-only check is enforced inside the service so it stays
 * consistent with changeVisibilityService / changeAccessLevelService.
 */
const updateLessonController = async (req, res) => {
  try {
    const { id: lessonId } = req.params;
    const { userId, ...payload } = req.body || {};

    const lesson = await lessonService.updateLessonService({
      lessonId,
      userId,
      payload,
    });

    return res.status(200).json({
      message: "Lesson updated successfully",
      lesson,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error updating lesson" : error.message,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/lessons/:id
 *
 * Owner-only. Removes the lesson document. The frontend should ask the
 * user to confirm before calling this endpoint.
 */
const deleteLessonController = async (req, res) => {
  try {
    const { id: lessonId } = req.params;
    const { userId } = req.body;

    const result = await lessonService.deleteLessonService({
      lessonId,
      userId,
    });

    return res.status(200).json({
      message: "Lesson deleted successfully",
      lessonId: result.lessonId,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error deleting lesson" : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  createLesson,
  getPublicLessons,
  getLessonsByUserId,
  getLessonById,
  toggleLikeLesson,
  toggleSaveLesson,
  changeVisibilityController,
  changeAccessLevelController,
  updateLessonController,
  deleteLessonController,
};
