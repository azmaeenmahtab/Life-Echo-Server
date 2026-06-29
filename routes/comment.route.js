const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/authMiddleware");

const commentController = require("../controllers/comment.controller");

// Listing is public — used by the public lesson detail page.
router.get("/all", commentController.getCommentsByLesson);

// Posting a comment requires an authenticated session so we can
// attribute the author.
router.post("/add", verifyJWT, commentController.createComment);

module.exports = router;
