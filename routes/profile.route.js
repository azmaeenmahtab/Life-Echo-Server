const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/authMiddleware");

const profileController = require("../controllers/profile.controller");

router.get("/:userId", verifyJWT, profileController.getCreatorProfile);

module.exports = router;
