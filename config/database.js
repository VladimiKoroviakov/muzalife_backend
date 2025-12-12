import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'muzalife',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5433,
});

export const query = (text, params) => pool.query(text, params);
export default pool;