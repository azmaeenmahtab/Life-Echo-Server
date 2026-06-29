const { ObjectId } = require("mongodb");
const { client } = require("../db/db");

const DB_NAME = "life-echo-db";
const USERS_COLLECTION = "user";
const LESSONS_COLLECTION = "lessons";

/**
 * Creates an error with an attached HTTP status code so the controller
 * can forward it without re-inspecting the message.
 */
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Resolves a user document by its `_id` (string or ObjectId). Returns null
 * when no user matches.
 */
const findUserById = async (userId) => {
  const users = client.db(DB_NAME).collection(USERS_COLLECTION);

  let objectId;
  try {
    objectId = new ObjectId(userId);
  } catch {
    throw httpError(400, `Invalid user id: ${userId}`);
  }

  return users.findOne({ _id: objectId });
};

/**
 * Fetches a creator profile along with everything the profile page needs:
 *  - the user document itself
 *  - every lesson authored by that user (newest first)
 *  - aggregate totals (lesson count + sum of savesCount)
 *
 * Returns `null` when no user matches the supplied id so the controller can
 * respond with a clean 404.
 */
const getCreatorProfileService = async (userId) => {
  const user = await findUserById(userId);
  if (!user) return null;

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  // The lessons collection stores `userId` as a string. If you switch it to
  // an ObjectId later, drop the `$toString` branch below.
  const pipeline = [
    {
      $match: {
        $expr: { $eq: [{ $toString: "$userId" }, userId] },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        title: 1,
        story: 1,
        category: 1,
        emotionalTone: 1,
        accessLevel: 1,
        imageUrl: 1,
        likesCount: 1,
        savesCount: 1,
        viewsCount: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ];

  const userLessons = await lessons.aggregate(pipeline).toArray();

  const totals = userLessons.reduce(
    (acc, lesson) => {
      acc.totalLessons += 1;
      acc.totalSaves += Number(lesson.savesCount ?? 0);
      acc.totalLikes += Number(lesson.likesCount ?? 0);
      acc.totalViews += Number(lesson.viewsCount ?? 0);
      return acc;
    },
    { totalLessons: 0, totalSaves: 0, totalLikes: 0, totalViews: 0 }
  );

  return {
    user: {
      _id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      bio: user.bio ?? null,
      plan: user.plan ?? "free",
      // Surface `role` so the admin profile header can render the
      // "Admin" badge. Default to "user" so older docs that pre-date
      // the role field still behave correctly.
      role: user.role ?? "user",
      authorTitle: user.authorTitle ?? null,
      lessonsCount: user.lessonsCount ?? null,
      studentsCount: user.studentsCount ?? null,
    },
    lessons: userLessons,
    totals: {
      totalLessons: totals.totalLessons,
      totalSaves: totals.totalSaves,
      totalLikes: totals.totalLikes,
      totalViews: totals.totalViews,
    },
  };
};

module.exports = {
  getCreatorProfileService,
};
