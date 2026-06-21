const express = require('express');
const router = express.Router();

const planController = require('../controllers/plan.controller');

router.post('/change-plan', planController.changePlan);

module.exports = router;