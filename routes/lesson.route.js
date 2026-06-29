const express = require("express");
const router = express.Router();

const lessonController = require("../controllers/lesson.controller");

router.post("/create", lessonController.createLesson);
router.get("/public", lessonController.getPublicLessons);
// Static segment must come before "/:id" so Express doesn't capture
// "user" as a lesson id.
router.get("/user/:userId", lessonController.getLessonsByUserId);
router.get(
  "/user/:userId/favorites",
  lessonController.getFavoriteLessonsController,
);
router.delete(
  "/user/:userId/favorites/:lessonId",
  lessonController.removeFavoriteLessonController,
);
router.get("/:id", lessonController.getLessonById);
router.post("/:id/like", lessonController.toggleLikeLesson);
router.post("/:id/save", lessonController.toggleSaveLesson);
router.patch(
  "/:id/visibility/change",
  lessonController.changeVisibilityController,
);
router.patch(
  "/:id/access-level/change",
  lessonController.changeAccessLevelController,
);
router.patch(
  "/:id/review-status/change",
  lessonController.setReviewStatusController,
);
router.put("/:id", lessonController.updateLessonController);
router.delete("/:id", lessonController.deleteLessonController);

module.exports = router;
