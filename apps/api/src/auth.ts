import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth/minimal';
import { prisma } from './db.js';

const config = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export const auth = betterAuth({
  baseURL: config('API_ORIGIN', 'http://localhost:3001'),
  trustedOrigins: [config('APP_ORIGIN', 'http://localhost:3000')],
  secret: config('BETTER_AUTH_SECRET', 'development-only-change-me'),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, requireEmailVerification: true },
  socialProviders: {
    google: {
      clientId: config('GOOGLE_CLIENT_ID'),
      clientSecret: config('GOOGLE_CLIENT_SECRET'),
      requireEmailVerification: true
    },
    github: { clientId: config('GITHUB_CLIENT_ID'), clientSecret: config('GITHUB_CLIENT_SECRET') }
  },
  account: { accountLinking: { enabled: true, trustedProviders: ['google', 'github'] } }
});
