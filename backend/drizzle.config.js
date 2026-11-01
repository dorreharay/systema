import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ quiet: true });

export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  ...(process.env.DATABASE_URL && { dbCredentials: { url: process.env.DATABASE_URL } }),
});
