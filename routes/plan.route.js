const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middleware/authMiddleware');

const planController = require('../controllers/plan.controller');

router.post('/change-plan', verifyJWT, planController.changePlan);

module.exports = router;