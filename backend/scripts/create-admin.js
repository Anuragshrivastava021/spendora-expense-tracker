import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db.js';

function readSecret(prompt) {
  if (!stdin.isTTY) throw new Error('Administrator setup requires an interactive terminal.');
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (key) => {
      if (key === '\u0003') return finish(new Error('Administrator setup cancelled.'));
      if (key === '\r' || key === '\n') return finish();
      if (key === '\u0008' || key === '\u007f') {
        value = value.slice(0, -1);
        stdout.write('\b \b');
        return;
      }
      if (key >= ' ') {
        value += key;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const input = readline.createInterface({ input: stdin, output: stdout });
try {
  const name = (await input.question('Administrator name: ')).trim();
  const email = (await input.question('Administrator email: ')).trim().toLowerCase();
  input.close();
  if (!name || name.length > 100) throw new Error('Name must be between 1 and 100 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  const password = await readSecret('Password (at least 12 characters): ');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must be at least 12 characters and at most 72 UTF-8 bytes.');
  const confirmation = await readSecret('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role, email_verified)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO NOTHING RETURNING id, email`,
    [name, email, passwordHash],
  );
  if (!result.rowCount) throw new Error('That email already has an account. Existing accounts are never promoted by this script.');
  console.log(`Administrator account created for ${result.rows[0].email}.`);
} catch (error) {
  console.error(`Administrator setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (!input.closed) input.close();
  await pool.end();
}
