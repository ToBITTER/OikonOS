import pg from 'pg';
import {config} from './config.js';
const {Pool}=pg;
export const pool=new Pool({connectionString:config().DATABASE_URL,max:20,idleTimeoutMillis:30_000,connectionTimeoutMillis:5_000,ssl:config().NODE_ENV==='production'?{rejectUnauthorized:true}:false});
pool.on('error',error=>console.error(JSON.stringify({level:'error',event:'postgres_pool_error',message:error.message})));
export async function query<T extends pg.QueryResultRow=any>(text:string,values:unknown[]=[]){return pool.query<T>(text,values)}
export async function transaction<T>(work:(client:pg.PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
export async function health(){const started=performance.now();await query('SELECT 1');return {database:'up',latencyMs:Math.round(performance.now()-started)}}
