const commentService = require("../services/comment.service");

const createComment = async (req, res) => {
  try {
    const lessonId = req.query.lessonId;
    const userId = req.query.userId;
    const comment = req.body?.comment;

    if (!lessonId || !userId) {
      return res
        .status(400)
        .json({ message: "lessonId and userId are required" });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: "Comment text cannot be empty" });
    }

    const created = await commentService.createComment({
      lessonId,
      userId,
      comment,
    });

    return res.status(201).json({
      message: "Comment posted successfully",
      comment: created,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error posting comment" : error.message,
      error: error.message,
    });
  }
};

const getCommentsByLesson = async (req, res) => {
  try {
    const lessonId = req.query.lessonId;
    if (!lessonId) {
      return res.status(400).json({ message: "lessonId is required" });
    }

    const comments = await commentService.getCommentsByLesson(lessonId);
    return res.status(200).json({
      message: "Comments fetched successfully",
      count: comments.length,
      comments,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error fetching comments" : error.message,
      error: error.message,
    });
  }
};

module.exports = { createComment, getCommentsByLesson };
