const express = require("express");
const router = express.Router();

const lessonController = require("../controllers/lesson.controller");

router.post("/create", lessonController.createLesson);
router.get("/public", lessonController.getPublicLessons);
router.get("/:id", lessonController.getLessonById);
router.post("/:id/like", lessonController.toggleLikeLesson);
router.post("/:id/save", lessonController.toggleSaveLesson);

module.exports = router;
