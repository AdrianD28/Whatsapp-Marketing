import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

(async () => {
  try {
    const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
    const db = client.db(process.env.MONGO_DB_NAME || 'whatsapp_marketing');
    
    console.log('\n🔧 Corrigiendo roles de usuarios...\n');
    
    // Actualizar todos los usuarios sin rol a "user"
    const result = await db.collection('users').updateMany(
      { $or: [{ role: null }, { role: { $exists: false } }] },
      { $set: { role: 'user' } }
    );
    
    console.log(`✅ ${result.modifiedCount} usuarios actualizados con rol "user"\n`);
    
    // Mostrar usuarios actualizados
    const users = await db.collection('users').find({}).toArray();
    console.log('👥 Usuarios después de la actualización:\n');
    users.forEach(u => {
      console.log(`  📧 Email: ${u.email}`);
      console.log(`     Role: ${u.role || 'user'}`);
      console.log(`     Credits: ${u.credits || 0}`);
      console.log('');
    });
    
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
