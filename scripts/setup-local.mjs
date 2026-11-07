import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = '.env.local';
let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
const get = key => content.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
function add(key, value) { if (!get(key)) content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`; }
add('POSTGRES_USER', 'proximity');
add('POSTGRES_PASSWORD', randomBytes(24).toString('hex'));
add('POSTGRES_DB', 'proximity');
add('POSTGRES_PORT', '5433');
add('DATABASE_URL', `postgresql://${get('POSTGRES_USER')}:${get('POSTGRES_PASSWORD')}@127.0.0.1:${get('POSTGRES_PORT')}/${get('POSTGRES_DB')}`);
add('BETTER_AUTH_SECRET', randomBytes(32).toString('hex'));
add('BETTER_AUTH_URL', 'http://127.0.0.1:3001');
writeFileSync(file, content, { mode: 0o600 });
chmodSync(file, 0o600);
mkdirSync('.data', { recursive: true, mode: 0o700 });
const accounts = '.data/local-accounts.json';
if (!existsSync(accounts)) writeFileSync(accounts, JSON.stringify([
  { email: 'borrower@proximitty.example', name: 'Alex Morgan', role: 'borrower', password: randomBytes(18).toString('base64url') },
  { email: 'lender@proximitty.example', name: 'Jordan Lee', role: 'lender', password: randomBytes(18).toString('base64url') },
], null, 2) + '\n', { mode: 0o600 });
console.log('Local configuration ready. Secrets preserved in ignored local files. Next: npm run db:up, npm run db:migrate, npm run db:seed.');
