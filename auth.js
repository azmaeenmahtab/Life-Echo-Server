// auth.js (or wherever you initialize auth)
const dotenv = require("dotenv");
dotenv.config();

const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("life-echo-db");

const auth = betterAuth({
  database: mongodbAdapter(db),
  // Ensure your secret matches the Next.js app's BETTER_AUTH_SECRET
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

module.exports = { auth };
