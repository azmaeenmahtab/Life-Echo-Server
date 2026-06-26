const express = require("express");
const router = express.Router();

const profileController = require("../controllers/profile.controller");

router.get("/:userId", profileController.getCreatorProfile);

module.exports = router;
