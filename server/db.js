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
  // Users & auth tokens
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('auth_tokens').createIndex({ token: 1 }, { unique: true });
  await db.collection('auth_tokens').createIndex({ userId: 1 });
  await db.collection('auth_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Corrige índice único para listas:
  // - Por compatibilidad legacy se usaba {accountKey, name} único global, lo cual bloquea a usuarios nuevos (userId) porque los docs sin accountKey
  //   colisionan con valores null en índices únicos. Soltamos ese índice si existe y creamos uno parcial solo cuando accountKey existe.
  try { await db.collection('lists').dropIndex('accountKey_1_name_1'); } catch {}
  try { await db.collection('lists').dropIndex({ accountKey: 1, name: 1 }); } catch {}
  await db.collection('lists').createIndex(
    { accountKey: 1, name: 1 },
    { unique: true, partialFilterExpression: { accountKey: { $exists: true } } }
  );
  await db.collection('lists').createIndex(
    { userId: 1, name: 1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true } } }
  );
  await db.collection('contacts').createIndex({ accountKey: 1, listId: 1 });
  await db.collection('contacts').createIndex({ accountKey: 1, numero: 1 });
  await db.collection('contacts').createIndex({ userId: 1, listId: 1 }, { partialFilterExpression: { userId: { $exists: true } } });
  await db.collection('contacts').createIndex({ userId: 1, numero: 1 }, { partialFilterExpression: { userId: { $exists: true } } });
  await db.collection('activities').createIndex({ accountKey: 1, timestamp: -1 });
  await db.collection('activities').createIndex({ userId: 1, timestamp: -1 }, { partialFilterExpression: { userId: { $exists: true } } });
  await db.collection('sessions').createIndex({ accountKey: 1, timestamp: -1 });
  await db.collection('sessions').createIndex({ userId: 1, timestamp: -1 }, { partialFilterExpression: { userId: { $exists: true } } });
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
