/**
 * @file Migration: add the GuestPurchases table to an existing database.
 *
 * Run once after pulling this commit on an existing installation:
 *   node scripts/migrate-guest-purchases.js
 *
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 */

import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const run = async () => {
  await client.connect();
  console.log('Connected to PostgreSQL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS GuestPurchases (
      id           SERIAL PRIMARY KEY,
      guest_email  VARCHAR(255) NOT NULL,
      product_id   INTEGER NOT NULL,
      order_id     VARCHAR(500) NOT NULL,
      bought_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
      UNIQUE (guest_email, product_id, order_id)
    )
  `);
  console.log('✅ GuestPurchases table ensured');

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_guest_purchases_email
      ON GuestPurchases(guest_email)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_guest_purchases_order_id
      ON GuestPurchases(order_id)
  `);
  console.log('✅ GuestPurchases indexes ensured');

  await client.end();
  console.log('Migration complete.');
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
