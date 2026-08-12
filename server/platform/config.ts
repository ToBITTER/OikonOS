import 'dotenv/config';
import { z } from 'zod';

const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 PORT:z.coerce.number().int().positive().default(4000),
 DATABASE_URL:z.string().url().or(z.string().startsWith('postgresql://')),
 WEB_ORIGIN:z.string().url().default('http://localhost:5173'),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
 ACCESS_TOKEN_TTL:z.string().default('15m'), REFRESH_TOKEN_TTL_DAYS:z.coerce.number().int().positive().default(30),
 TRUST_PROXY:z.enum(['true','false']).default('false')
});
export type Config=z.infer<typeof schema>;
let value:Config|undefined;
export function config(){if(!value){const result=schema.safeParse(process.env);if(!result.success)throw new Error(`Invalid runtime configuration: ${result.error.issues.map(x=>x.path.join('.')+': '+x.message).join('; ')}`);value=result.data}return value}
