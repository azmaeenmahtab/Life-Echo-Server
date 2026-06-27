const { ObjectId } = require("mongodb");
const { getClient } = require("../db/db");

const DB_NAME = "life-echo-db";
const COMMENTS_COLLECTION = "comments";

/**
 * Creates a comment on a lesson and bumps the cached counter on the
 * lesson document so the public list doesn't need a separate $lookup
 * to show the count.
 */
const createComment = async ({ lessonId, userId, comment }) => {
  const client = await getClient();
  const db = client.db(DB_NAME);
  const comments = db.collection(COMMENTS_COLLECTION);
  const lessons = db.collection("lessons");

  if (!ObjectId.isValid(lessonId)) {
    const error = new Error("Invalid lessonId");
    error.statusCode = 400;
    throw error;
  }

  const lessonObjectId = new ObjectId(lessonId);
  const userObjectId = new ObjectId(userId);
  const now = new Date();

  // Verify the lesson exists before writing anything.
  const lesson = await lessons.findOne(
    { _id: lessonObjectId },
    { projection: { _id: 1 } },
  );
  if (!lesson) {
    const error = new Error("Lesson not found");
    error.statusCode = 404;
    throw error;
  }

  // Verify the user exists before writing the comment.
  const user = db.collection("user");
  const currentUser = await user.findOne(
    { _id: userObjectId },
    { projection: { _id: 1 } },
  );
  if (!currentUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const document = {
    lessonId: lessonObjectId,
    userId,
    comment: comment.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const result = await comments.insertOne(document);

  // Keep the cached counter in sync.
  await lessons.updateOne(
    { _id: lessonObjectId },
    { $inc: { commentsCount: 1 }, $set: { updatedAt: now } },
  );

  return { _id: result.insertedId, ...document };
};

/**
 * Returns every comment for a lesson, newest first, with the author's
 * name and profile pic denormalised onto each row so the UI can render
 * the list in one round-trip.
 *
 * Comments store `userId` as a string, so the lookup normalises via
 * `$toString` to match against either ObjectId or string `_id` shapes
 * in the `user` collection.
 */
const getCommentsByLesson = async (lessonId) => {
  if (!ObjectId.isValid(lessonId)) {
    const error = new Error("Invalid lessonId");
    error.statusCode = 400;
    throw error;
  }

  const lessonObjectId = new ObjectId(lessonId);
  const client = await getClient();
  const db = client.db(DB_NAME);
  const comments = db.collection(COMMENTS_COLLECTION);

  // Confirm the lesson actually exists so callers get a 404 instead
  // of an empty array (which would otherwise be indistinguishable from
  // "no comments yet").
  const lesson = await db
    .collection("lessons")
    .findOne({ _id: lessonObjectId }, { projection: { _id: 1 } });
  if (!lesson) {
    const error = new Error("Lesson not found");
    error.statusCode = 404;
    throw error;
  }

  const docs = await comments
    .aggregate([
      { $match: { lessonId: lessonObjectId } },
      {
        $addFields: {
          userObjectId: {
            $cond: [
              { $eq: [{ $type: "$userId" }, "string"] },
              { $toObjectId: "$userId" },
              "$userId",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "userObjectId",
          foreignField: "_id",
          as: "author",
        },
      },
      { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          authorId: { $ifNull: ["$author._id", null] },
          authorName: { $ifNull: ["$author.name", null] },
          authorProfilePic: { $ifNull: ["$author.image", null] },
        },
      },
      { $project: { author: 0, userObjectId: 0 } },
      { $sort: { createdAt: -1 } },
    ])
    .toArray();

  return docs;
};

module.exports = { createComment, getCommentsByLesson };
