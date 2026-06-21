const { ObjectId } = require('mongodb');
const { client } = require('../db/db');

const DB_NAME = 'life-echo-db';
const USERS_COLLECTION = 'user';

const changeUserPlan = async (userId, newPlan) => {
  if (!ObjectId.isValid(userId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }

  const users = client.db(DB_NAME).collection(USERS_COLLECTION);

  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: { plan: newPlan } },
    { returnDocument: 'after' }
  );

  // The native driver returns the updated doc directly (or null if not found),
  // depending on version. Handle both shapes.
  const user = result && result.value !== undefined ? result.value : result;

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return { plan: user.plan };
};

module.exports = {
  changeUserPlan,
};