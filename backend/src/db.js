import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.production ? { rejectUnauthorized: config.databaseSslRejectUnauthorized } : undefined,
});

export const query = (text, params) => pool.query(text, params);
