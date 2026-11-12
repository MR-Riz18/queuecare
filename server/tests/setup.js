/**
 * In-memory MongoDB for the DB-backed tests (concurrency, RBAC, isolation,
 * sockets). If the mongod binary cannot be downloaded/started in this
 * environment, the helper reports unavailable and every DB test skips
 * gracefully with a clear console message instead of failing.
 */
const mongoose = require('mongoose');

// MongoDB 6.0.16 is pinned because newer 7.x binaries intermittently crash
// with an internal invariant failure in containerized environments.
// Override with MONGOMS_VERSION if you need a different version.
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.16';

let mongod = null;
let available = false;
let warned = false;

async function startMemoryDB() {
  if (available) return true;
  try {
    // eslint-disable-next-line global-require
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create({ instance: { dbName: 'queuecare-test' } });
    await mongoose.connect(mongod.getUri());
    available = true;
  } catch (err) {
    if (!warned) {
      warned = true;
      console.log(
        `\n  ⊘ DB-backed tests SKIPPED: mongodb-memory-server unavailable (${String(
          err.message || err
        ).split('\n')[0]}). Run with network access to enable them.\n`
      );
    }
  }
  return available;
}

async function stopMemoryDB() {
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  try {
    if (mongod) await mongod.stop();
  } catch {
    /* ignore */
  }
  mongod = null;
  available = false;
}

/** True when an in-memory MongoDB is up for this run. */
function dbAvailable() {
  return available;
}

/**
 * Drop every collection — call between tests for isolation.
 */
async function clearDB() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

module.exports = { startMemoryDB, stopMemoryDB, dbAvailable, clearDB };
