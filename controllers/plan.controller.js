const planService = require('../services/plan.service');

/**
 * Controller layer: handles HTTP concerns only (parsing req, shaping res,
 * translating service errors into HTTP status codes). All data-access work
 * is delegated to the service.
 */

const changePlan = async (req, res) => {
  const { userId, newPlan } = req.body;

  if (!userId || !newPlan) {
    return res.status(400).json({ message: 'userId and newPlan are required' });
  }

  try {
    const result = await planService.changeUserPlan(userId, newPlan);
    return res.status(200).json({ message: 'Plan changed successfully', ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ message: status === 500 ? 'Error changing plan' : error.message, error: error.message });
  }
};

module.exports = {
  changePlan,
};