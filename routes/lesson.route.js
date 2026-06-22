const express = require('express');
const router = express.Router();

const lessonController = require('../controllers/lesson.controller');

router.post('/create', lessonController.createLesson);

module.exports = router;