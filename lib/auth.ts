import { betterAuth } from 'better-auth';
import { pool } from './db';
export function createAuth(forSeed = false) {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is missing; run npm run setup:local.');
  return betterAuth({
    database: pool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3001',
    trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3001'],
    emailAndPassword: { enabled: true, disableSignUp: !forSeed },
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
