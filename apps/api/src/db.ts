import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://ai_office:ai_office@localhost:55432/ai_office?schema=public';

export const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
