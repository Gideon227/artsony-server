import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { config as loadEnv } from 'dotenv';

loadEnv();

import { supabaseAdmin } from '../src/config/supabase.js';
import { logger } from '../src/lib/logger/index.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

const run = async (): Promise<void> => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    logger.info({ file }, 'Running migration');

    const { error } = await supabaseAdmin.rpc('exec_sql', { sql });

    if (error) {
      logger.error({ file, error }, 'Migration failed');
      process.exit(1);
    }

    logger.info({ file }, 'Migration complete');
  }

  logger.info('All migrations complete');
  process.exit(0);
};

run().catch((err) => {
  logger.fatal({ err }, 'Migration runner crashed');
  process.exit(1);
});