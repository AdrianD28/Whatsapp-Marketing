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
  try {
    // Users & auth tokens
    await db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
    await db.collection('auth_tokens').createIndex({ token: 1 }, { unique: true }).catch(() => {});
    await db.collection('auth_tokens').createIndex({ userId: 1 }).catch(() => {});
    await db.collection('auth_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});

    // Corrige índice único para listas:
    // - Por compatibilidad legacy se usaba {accountKey, name} único global, lo cual bloquea a usuarios nuevos (userId) porque los docs sin accountKey
    //   colisionan con valores null en índices únicos. Soltamos ese índice si existe y creamos uno parcial solo cuando accountKey existe.
    try { await db.collection('lists').dropIndex('accountKey_1_name_1'); } catch {}
    try { await db.collection('lists').dropIndex({ accountKey: 1, name: 1 }); } catch {}
    await db.collection('lists').createIndex(
      { accountKey: 1, name: 1 },
      { unique: true, partialFilterExpression: { accountKey: { $exists: true } } }
    ).catch(() => {});
    await db.collection('lists').createIndex(
      { userId: 1, name: 1 },
      { unique: true, partialFilterExpression: { userId: { $exists: true } } }
    ).catch(() => {});
    await db.collection('contacts').createIndex({ accountKey: 1, listId: 1 }).catch(() => {});
    await db.collection('contacts').createIndex({ accountKey: 1, numero: 1 }).catch(() => {});
    await db.collection('contacts').createIndex({ userId: 1, listId: 1 }, { partialFilterExpression: { userId: { $exists: true } } }).catch(() => {});
    await db.collection('contacts').createIndex({ userId: 1, numero: 1 }, { partialFilterExpression: { userId: { $exists: true } } }).catch(() => {});
    await db.collection('activities').createIndex({ accountKey: 1, timestamp: -1 }).catch(() => {});
    await db.collection('activities').createIndex({ userId: 1, timestamp: -1 }, { partialFilterExpression: { userId: { $exists: true } } }).catch(() => {});
    await db.collection('sessions').createIndex({ accountKey: 1, timestamp: -1 }).catch(() => {});
    await db.collection('sessions').createIndex({ userId: 1, timestamp: -1 }, { partialFilterExpression: { userId: { $exists: true } } }).catch(() => {});

    // Reportería
    // send_logs: agrupar por campaña (batchId) y consultar por usuario
    try { await db.collection('send_logs').createIndex({ userId: 1, time: -1 }); } catch {}
    try { await db.collection('send_logs').createIndex({ userId: 1, batchId: 1, time: -1 }); } catch {}
    try { await db.collection('send_logs').createIndex({ userId: 1, messageId: 1 }, { partialFilterExpression: { messageId: { $exists: true } }, unique: false }); } catch {}
    // message_events: estados de webhook por mensaje
    try { await db.collection('message_events').createIndex({ userId: 1, messageId: 1 }, { unique: true }); } catch {}
    try { await db.collection('message_events').createIndex({ userId: 1, updatedAt: -1 }); } catch {}
  } catch (err) {
    console.error('Error creating indexes (non-fatal):', err.message);
  }
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
