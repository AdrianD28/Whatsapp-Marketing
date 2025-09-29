import { MongoClient, ObjectId } from 'mongodb';

let client;
let db;

export async function getDb() {
  if (db) return db;
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'whatsapp_marketing';
  if (!client) {
    client = new MongoClient(uri, { pkFactory: { createPk: () => new ObjectId() } });
  }
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(db) {
  await db.collection('lists').createIndex({ accountKey: 1, name: 1 }, { unique: true });
  await db.collection('contacts').createIndex({ accountKey: 1, listId: 1 });
  await db.collection('contacts').createIndex({ accountKey: 1, numero: 1 });
  await db.collection('activities').createIndex({ accountKey: 1, timestamp: -1 });
  await db.collection('sessions').createIndex({ accountKey: 1, timestamp: -1 });
}

export function getAccountKeyFromReq(req) {
  return (
    req.headers['x-account-key'] ||
    req.query.accountKey ||
    req.body?.accountKey ||
    null
  );
}

export { ObjectId };
