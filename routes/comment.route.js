const express = require("express");
const router = express.Router();

const commentController = require("../controllers/comment.controller");

router.post("/add", commentController.createComment);
router.get("/all", commentController.getCommentsByLesson);

module.exports = router;
