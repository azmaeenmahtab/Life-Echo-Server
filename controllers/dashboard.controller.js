const dashboardService = require("../services/dashboard.service");

/**
 * GET /api/dashboard/stats?userId=...
 *
 * Returns the three top-of-dashboard stat cards. Reads `userId` from
 * the query string so the endpoint stays trivially cacheable and
 * doesn't need to be re-bound to the session in the route layer.
 */
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const windowDaysRaw = req.query.windowDays;
    const windowDays = windowDaysRaw
      ? Math.max(1, Math.min(365, Number.parseInt(windowDaysRaw, 10) || 30))
      : 30;

    const stats = await dashboardService.getDashboardStats(userId, {
      windowDays,
    });

    return res.status(200).json({
      message: "Dashboard stats fetched successfully",
      ...stats,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message:
        status === 500 ? "Error fetching dashboard stats" : error.message,
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/activity?userId=...&days=...
 *
 * Returns the five totals rendered by the activity chart. `days` is
 * optional — omitting it returns all-time counts, which is the
 * current chart behaviour.
 */
const getDashboardActivity = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const daysRaw = req.query.days;
    const days = daysRaw
      ? Math.max(1, Math.min(365, Number.parseInt(daysRaw, 10) || null))
      : null;

    const activity = await dashboardService.getDashboardActivity(userId, {
      days,
    });

    return res.status(200).json({
      message: "Dashboard activity fetched successfully",
      ...activity,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message:
        status === 500 ? "Error fetching dashboard activity" : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getDashboardActivity,
};
