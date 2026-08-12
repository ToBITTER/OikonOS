import {randomUUID} from 'node:crypto';
import type {RequestHandler} from 'express';
export type Actor={userId:string;organizationId:string;membershipId:string;role:string;permissions:string[]};
declare global{namespace Express{interface Request{actor?:Actor}}}
export const requestContext:RequestHandler=(req,res,next)=>{const id=req.header('x-request-id')||randomUUID();res.locals.requestId=id;res.setHeader('x-request-id',id);next()};
