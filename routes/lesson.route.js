const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/authMiddleware");

const lessonController = require("../controllers/lesson.controller");

// --- Public endpoints (home, public lessons, login/register) ---------------

router.get("/public", lessonController.getPublicLessons);
// Static segment must come before "/:id" so Express doesn't capture
// "user" as a lesson id.
router.get("/user/:userId", lessonController.getLessonsByUserId);
router.get("/:id", verifyJWT, lessonController.getLessonById);

// --- Authenticated endpoints -----------------------------------------------

router.post("/create", verifyJWT, lessonController.createLesson);

router.get(
  "/user/:userId/favorites",
  verifyJWT,
  lessonController.getFavoriteLessonsController,
);
router.delete(
  "/user/:userId/favorites/:lessonId",
  verifyJWT,
  lessonController.removeFavoriteLessonController,
);

router.post("/:id/like", verifyJWT, lessonController.toggleLikeLesson);
router.post("/:id/save", verifyJWT, lessonController.toggleSaveLesson);

router.patch(
  "/:id/visibility/change",
  verifyJWT,
  lessonController.changeVisibilityController,
);
router.patch(
  "/:id/access-level/change",
  verifyJWT,
  lessonController.changeAccessLevelController,
);
router.patch(
  "/:id/review-status/change",
  verifyJWT,
  lessonController.setReviewStatusController,
);
router.patch(
  "/:id/featured/toggle",
  verifyJWT,
  lessonController.toggleFeaturedController,
);

router.put("/:id", verifyJWT, lessonController.updateLessonController);
router.delete("/:id", verifyJWT, lessonController.deleteLessonController);

module.exports = router;
