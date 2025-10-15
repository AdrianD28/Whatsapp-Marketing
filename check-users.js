import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

(async () => {
  try {
    const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
    const db = client.db(process.env.MONGO_DB_NAME || 'whatsapp_marketing');
    const users = await db.collection('users').find({}).toArray();
    
    console.log('\n👥 Usuarios en la base de datos:\n');
    users.forEach(u => {
      console.log(`  📧 Email: ${u.email}`);
      console.log(`     Role: ${u.role || 'user'}`);
      console.log(`     Credits: ${u.credits || 0}`);
      console.log(`     ID: ${u._id}`);
      console.log('');
    });
    
    console.log(`Total: ${users.length} usuarios\n`);
    
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
