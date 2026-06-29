const adminService = require("../services/admin.service");

/**
 * GET /api/dashboard/top-weekly-contributors?days=7&limit=3
 *
 * Public-facing (no auth gate today) for the home page's "Top
 * Contributors of the Week" section. `days` defaults to 7 on the
 * service and is clamped to [1, 365]; `limit` defaults to 3 and is
 * clamped to [1, 50].
 */
const getTopWeeklyContributors = async (req, res) => {
  try {
    const daysRaw = req.query.days;
    const days = daysRaw
      ? Math.max(1, Math.min(365, Number.parseInt(daysRaw, 10) || 7))
      : 7;

    const limitRaw = req.query.limit;
    const limit = limitRaw
      ? Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || 3))
      : 3;

    const contributors = await adminService.getTopWeeklyContributors({
      days,
      limit,
    });

    return res.status(200).json({
      message: "Top weekly contributors fetched successfully",
      total: contributors.length,
      windowDays: days,
      contributors,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching top weekly contributors",
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/most-saved-lessons?limit=3
 *
 * Public-facing endpoint for the home page's "Community Favorites"
 * section. Returns the lessons with the highest `savesCount`,
 * with the creator joined in the same response.
 */
const getMostSavedLessons = async (req, res) => {
  try {
    const limitRaw = req.query.limit;
    const limit = limitRaw
      ? Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || 3))
      : 3;

    const lessons = await adminService.getMostSavedLessons({ limit });

    return res.status(200).json({
      message: "Most saved lessons fetched successfully",
      total: lessons.length,
      lessons,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching most saved lessons",
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/top-contributors?limit=5
 *
 * Returns the users who have authored the most lessons, ordered
 * descending. Drives the "Most active contributors" card on the
 * admin dashboard.
 *
 * `limit` is optional; defaults to 5 on the service. Clamped to
 * [1, 50] defensively so a curious caller can't fan it out into a
 * full export query.
 */
const getTopContributors = async (req, res) => {
  try {
    const limitRaw = req.query.limit;
    const limit = limitRaw
      ? Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || 5))
      : 5;

    const contributors = await adminService.getTopContributors({ limit });

    return res.status(200).json({
      message: "Top contributors fetched successfully",
      total: contributors.length,
      contributors,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching top contributors",
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/today-lessons?limit=5
 *
 * Returns the count of lessons authored in the last 24 hours plus the
 * most recent `limit` of them. Drives the "Today's new lessons" card
 * on the admin dashboard.
 *
 * `limit` is optional; defaults to 5 on the service. Clamped to
 * [1, 50] defensively.
 */
const getTodaysLessons = async (req, res) => {
  try {
    const limitRaw = req.query.limit;
    const limit = limitRaw
      ? Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || 5))
      : 5;

    const result = await adminService.getTodaysLessons({ limit });

    return res.status(200).json({
      message: "Today's lessons fetched successfully",
      total: result.total,
      lessons: result.lessons,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching today's lessons",
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/lesson-growth?days=30
 *
 * Returns the cumulative lesson count bucketed by day, plus the
 * current total. Drives the "Lesson growth" line chart on the admin
 * dashboard.
 *
 * `days` is optional; defaults to 30 on the service. Clamped to
 * [1, 365] so a curious caller can't fan it out into a multi-year
 * query against the lessons collection.
 */
const getLessonGrowth = async (req, res) => {
  try {
    const daysRaw = req.query.days;
    const days = daysRaw
      ? Math.max(1, Math.min(365, Number.parseInt(daysRaw, 10) || 30))
      : 30;

    const result = await adminService.getLessonGrowth({ days });

    return res.status(200).json({
      message: "Lesson growth fetched successfully",
      total: result.total,
      windowDays: result.windowDays,
      series: result.series,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching lesson growth",
      error: error.message,
    });
  }
};

/**
 * GET /api/dashboard/user-growth?days=30
 *
 * Returns the cumulative user signup count bucketed by day, plus the
 * current total. Drives the "User growth" line chart on the admin
 * dashboard. The total reported is the lifetime user count, not the
 * count over the window — the headline number should be the platform
 * total, not a sliding 30-day number.
 *
 * `days` is optional; defaults to 30 on the service. Clamped to
 * [1, 365] defensively.
 */
const getUserGrowth = async (req, res) => {
  try {
    const daysRaw = req.query.days;
    const days = daysRaw
      ? Math.max(1, Math.min(365, Number.parseInt(daysRaw, 10) || 30))
      : 30;

    const result = await adminService.getUserGrowth({ days });

    return res.status(200).json({
      message: "User growth fetched successfully",
      total: result.total,
      windowDays: result.windowDays,
      series: result.series,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching user growth",
      error: error.message,
    });
  }
};

module.exports = {
  getTopContributors,
  getTodaysLessons,
  getLessonGrowth,
  getUserGrowth,
  getTopWeeklyContributors,
  getMostSavedLessons,
};
