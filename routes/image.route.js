const express = require("express");
const multer = require("multer");
const { verifyJWT } = require("../middleware/authMiddleware");

const imageController = require("../controllers/image.controller");

const router = express.Router();

// Keep the upload in memory â€” we forward the buffer to imgbb as base64, so
// there's no need to write to disk. 32MB matches imgbb's free-tier ceiling.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

// `image` is the multipart field name the client must use when posting.
// Uploads are only triggered from the authenticated "Add lesson" /
// "Edit profile" forms, so require a valid session.
router.post(
  "/upload",

  upload.single("image"),
  imageController.uploadImage,
);

module.exports = router;
