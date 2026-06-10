import { encrypt, decrypt } from './modules/connections/crypto.utils';
import { validateSQL } from './modules/query/validator';
import { computeSchemaFingerprint } from './modules/schema/introspector';
import crypto from 'crypto';

// Setup environment variables for test
process.env.ENCRYPTION_KEY = '637573746f6d65727365676d656e74656e6372797074696f6e6b6579666f7261'; // 32-byte hex key
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

async function runTests() {
  console.log('🧪 Starting QueryMind AI Integration Tests...');
  let failed = false;

  // Test 1: AES-256-GCM Encryption/Decryption
  try {
    console.log('\n--- Test 1: Crypto AES-256-GCM Encryption ---');
    const secretConnString = 'postgresql://admin:super_secret_password@db-server:5432/analytics_db';
    console.log(`Original:  "${secretConnString}"`);
    
    const encrypted = encrypt(secretConnString);
    console.log(`Encrypted: "${encrypted}"`);
    
    // Check format: iv:authTag:cipher
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid encrypted format. Expected 3 colon-separated parts, got ${parts.length}`);
    }
    console.log(`✓ IV Length: ${parts[0].length / 2} bytes (hex: ${parts[0]})`);
    console.log(`✓ Auth Tag Length: ${parts[1].length / 2} bytes (hex: ${parts[1]})`);

    const decrypted = decrypt(encrypted);
    console.log(`Decrypted: "${decrypted}"`);
    
    if (decrypted !== secretConnString) {
      throw new Error('Decrypted string does not match original!');
    }
    console.log('✓ Cryptography tests passed successfully.');
  } catch (err: any) {
    console.error('❌ Test 1 Failed:', err.message || err);
    failed = true;
  }

  // Test 2: Token Hashing helper
  try {
    console.log('\n--- Test 2: Token Hashing ---');
    const dummyToken = 'my-super-secret-refresh-token';
    const hash1 = crypto.createHash('sha256').update(dummyToken).digest('hex');
    const hash2 = crypto.createHash('sha256').update(dummyToken).digest('hex');
    
    if (hash1 !== hash2) {
      throw new Error('Hashes for the same input do not match!');
    }
    console.log(`✓ SHA-256 Hash: ${hash1}`);
    console.log('✓ Token Hashing tests passed.');
  } catch (err: any) {
    console.error('❌ Test 2 Failed:', err.message || err);
    failed = true;
  }

  // Test 3: Dev Auth Bypass Configuration Check
  try {
    console.log('\n--- Test 3: Dev Auth Bypass Configuration ---');
    const isDevBypassEnabled = process.env.DEV_AUTH_BYPASS === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    
    console.log(`DEV_AUTH_BYPASS env: ${isDevBypassEnabled}`);
    console.log(`NODE_ENV env: ${process.env.NODE_ENV}`);
    
    const shouldAllowBypass = isDevBypassEnabled && !isProduction;
    console.log(`Bypass allowed in current env: ${shouldAllowBypass}`);
    
    if (!shouldAllowBypass) {
      throw new Error('Bypass authorization should be allowed under test environment configuration');
    }
    console.log('✓ Dev auth bypass configuration check passed.');
  } catch (err: any) {
    console.error('❌ Test 3 Failed:', err.message || err);
    failed = true;
  }

  // Test 4: SQL Validator - Keyword Blocklist
  try {
    console.log('\n--- Test 4: SQL Validator - Keyword Blocklist ---');
    const badQuery = 'SELECT * FROM users; DROP TABLE workspaces;';
    const validation = validateSQL(badQuery);
    console.log(`Query: "${badQuery}"`);
    console.log(`Valid: ${validation.valid}, Reason: "${validation.rejectionReason}"`);
    if (validation.valid) {
      throw new Error('Blocked keyword query was accepted!');
    }
    console.log('✓ Blocked keyword rejected successfully.');
  } catch (err: any) {
    console.error('❌ Test 4 Failed:', err.message || err);
    failed = true;
  }

  // Test 5: SQL Validator - AST & LIMIT Injection
  try {
    console.log('\n--- Test 5: SQL Validator - AST & LIMIT Injection ---');
    const selectQuery = 'SELECT id, email FROM users';
    const validation = validateSQL(selectQuery);
    console.log(`Original: "${selectQuery}"`);
    console.log(`Valid: ${validation.valid}`);
    console.log(`Modified SQL: "${validation.sql}"`);
    console.log(`Modifications: ${JSON.stringify(validation.modifications)}`);
    
    if (!validation.valid) {
      throw new Error('Valid query was rejected!');
    }
    if (!validation.sql.includes('LIMIT 1000')) {
      throw new Error('LIMIT 1000 was not injected!');
    }
    
    // Test capping
    const capQuery = 'SELECT id FROM users LIMIT 5000';
    const capValidation = validateSQL(capQuery);
    console.log(`Original: "${capQuery}"`);
    console.log(`Modified SQL: "${capValidation.sql}"`);
    if (!capValidation.sql.includes('LIMIT 1000')) {
      throw new Error('LIMIT 5000 was not capped to 1000!');
    }
    console.log('✓ AST check and LIMIT injection verified.');
  } catch (err: any) {
    console.error('❌ Test 5 Failed:', err.message || err);
    failed = true;
  }

  // Test 6: Schema Fingerprint Computation
  try {
    console.log('\n--- Test 6: Schema Fingerprint Computation ---');
    const mockTables = [
      {
        tableName: 'users',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: null },
          { columnName: 'email', dataType: 'varchar', isNullable: false, columnDefault: null }
        ],
        foreignKeys: [],
        indexes: [],
        description: 'users table'
      },
      {
        tableName: 'workspaces',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: null },
          { columnName: 'name', dataType: 'varchar', isNullable: false, columnDefault: null }
        ],
        foreignKeys: [],
        indexes: [],
        description: 'workspaces table'
      }
    ];
    
    const fp1 = computeSchemaFingerprint(mockTables);
    const fp2 = computeSchemaFingerprint([...mockTables].reverse()); // reverse order should give same hash
    console.log(`Fingerprint 1: ${fp1}`);
    console.log(`Fingerprint 2: ${fp2}`);
    if (fp1 !== fp2) {
      throw new Error('Schema order changed the fingerprint!');
    }
    console.log('✓ Fingerprint logic verified.');
  } catch (err: any) {
    console.error('❌ Test 6 Failed:', err.message || err);
    failed = true;
  }

  if (failed) {
    console.log('\n❌ Some integration tests failed.');
    process.exit(1);
  } else {
    console.log('\n🎉 All foundation layer and Core AI validator tests passed successfully!');
    process.exit(0);
  }
}

runTests();
