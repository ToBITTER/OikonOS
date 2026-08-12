import type {RequestHandler} from 'express';
import jwt from 'jsonwebtoken';
import {config} from '../platform/config.js';
import {AppError} from '../platform/errors.js';
import {rolePermissions,type Permission} from './permissions.js';
type Claims={sub:string;org:string;membership:string;role:string;permissions?:string[];type:'access'};
export const authenticate:RequestHandler=(req,_res,next)=>{const header=req.header('authorization');if(!header?.startsWith('Bearer '))return next(new AppError(401,'AUTH_REQUIRED','Sign in to continue.'));try{const claims=jwt.verify(header.slice(7),config().JWT_ACCESS_SECRET,{algorithms:['HS256']}) as Claims;if(claims.type!=='access'||!claims.sub||!claims.org)throw new Error();req.actor={userId:claims.sub,organizationId:claims.org,membershipId:claims.membership,role:claims.role,permissions:[...new Set([...(rolePermissions[claims.role]||[]),...(claims.permissions||[])])]};next()}catch{return next(new AppError(401,'INVALID_SESSION','Your session is invalid or has expired.'))}};
export const requirePermission=(...needed:Permission[]):RequestHandler=>(req,_res,next)=>{if(!req.actor)return next(new AppError(401,'AUTH_REQUIRED','Sign in to continue.'));if(!needed.every(x=>req.actor!.permissions.includes(x)))return next(new AppError(403,'PERMISSION_DENIED','You do not have permission to perform this action.'));next()};
