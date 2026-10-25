import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

let client;
let inTransaction = false;
try {
  client = await pool.connect();
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await client.query('BEGIN');
  inTransaction = true;
  await client.query(schema);
  await client.query('COMMIT');
  inTransaction = false;
  console.log('Database schema is up to date.');
} catch (error) {
  if (client && inTransaction) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Database rollback failed:', rollbackError.message);
    }
  }
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
