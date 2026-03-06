import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { config } from './config';

// Supabase JS client — for auth and simple CRUD
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

// Raw pg Pool — for FOR UPDATE SKIP LOCKED in the delivery worker
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: { rejectUnauthorized: false },
});
