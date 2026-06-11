import prisma from '../../config/db';
import { runAnalystAgent } from './analyst-agent';
import { encrypt } from '../connections/crypto.utils';
import pg from 'pg';

// Set up environment variable key so cryptography utils work
process.env.ENCRYPTION_KEY = '637573746f6d65727365676d656e74656e6372797074696f6e6b6579666f7261';


// Mock DB connection findFirst
(prisma.dbConnection.findFirst as any) = async () => {
  return {
    id: 'test-conn-id',
    name: 'test-db',
    dbType: 'POSTGRES',
    encryptedConnString: encrypt('postgresql://localhost:5432/test-db'),
  };
};

// Mock raw query for retrieveRelevantSchema
(prisma.$queryRawUnsafe as any) = async () => {
  return [
    {
      table_name: 'users',
      column_names: ['id', 'email', 'name'],
      description: 'User details',
      similarity: 0.9,
    },
  ];
};

// Mock pg Client
(pg as any).Client = class MockClient {
  async connect() {}
  async query() {
    return {
      rows: [{ id: 1, email: 'user1@example.com', name: 'User One' }],
      fields: [{ name: 'id' }, { name: 'email' }, { name: 'name' }],
      rowCount: 1,
    };
  }
  async end() {}
};

async function testAgent() {
  console.log('🧪 Starting Analyst Agent loop mock validation test...');
  let steps: any[] = [];
  let results: any[] = [];

  const answer = await runAnalystAgent(
    'Show me the users list and why they are changing',
    'test-conn-id',
    'test-workspace-id',
    (step) => {
      console.log('   [Step Callback]', JSON.stringify(step));
      steps.push(step);
    },
    (res) => {
      console.log('   [Result Callback]', JSON.stringify(res));
      results.push(res);
    }
  );

  console.log('\nFinal Synthesized Answer:\n', answer);

  if (steps.length !== 3) {
    console.error(`❌ Expected exactly 3 steps, got ${steps.length}`);
    process.exit(1);
  }
  if (results.length !== 2) {
    console.error(`❌ Expected exactly 2 tool execution results, got ${results.length}`);
    process.exit(1);
  }
  if (!answer.includes('user registrations growing')) {
    console.error('❌ Final answer does not match the mocked synthesis.');
    process.exit(1);
  }

  console.log('🎉 Analyst Agent mock loop validation test passed successfully!');
  process.exit(0);
}

testAgent().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
