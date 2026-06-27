const dotenv = require('dotenv');
dotenv.config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version.
// A longer `serverSelectionTimeoutMS` gives the driver more room to recover
// from transient Atlas disconnects before throwing, and `maxPoolSize` keeps
// the topology warm across requests so we don't re-handshake on every call.
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 20,
});

// Track whether we've successfully completed the initial connect so we
// can transparently reconnect on subsequent requests if the driver ever
// closed the topology (e.g. after an idle disconnect from Atlas).
let connected = false;

async function db_connect() {
  await client.connect();
  await client.db("life-echo-db").command({ ping: 1 });
  connected = true;
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
}

/**
 * Returns the shared MongoClient, transparently reconnecting if the
 * previous topology was closed. Without this, a single transient
 * disconnect leaves every subsequent query throwing
 * `MongoTopologyClosedError`.
 */
async function getClient() {
  if (!connected) {
    await db_connect();
  }
  return client;
}

// If the driver itself reports a topology close (idle drop, Atlas
// maintenance, etc.), reset our flag so the next `getClient()` call
// reconnects automatically.
client.on("topologyClosed", () => {
  connected = false;
});

module.exports = { db_connect, getClient, client };
