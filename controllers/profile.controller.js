const profileService = require("../services/profile.service");

/**
 * GET /api/profile/:userId
 * Returns the creator profile bundle: user info, lessons, and totals.
 */
const getCreatorProfile = async (req, res) => {
  try {
    const profile = await profileService.getCreatorProfileService(req.params.userId);

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      message: "Profile fetched successfully",
      user: profile.user,
      lessons: profile.lessons,
      lessonsCount: profile.totals.totalLessons,
      totalSaves: profile.totals.totalSaves,
      totalLikes: profile.totals.totalLikes,
      totalViews: profile.totals.totalViews,
      totals: profile.totals,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Error fetching profile" : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  getCreatorProfile,
};
