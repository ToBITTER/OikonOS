import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export type Product={id:string;name:string;sku:string;category:string;price:number;cost:number;stock:number;threshold:number;status:'active'|'archived'};
export type Sale={id:string;number:string;createdAt:string;sellerId:string;sellerName:string;customerId?:string;customerName?:string;payment:'cash'|'card'|'transfer';total:number;profit:number;items:{productId:string;name:string;qty:number;price:number}[]};
export type Customer={id:string;name:string;phone:string;email:string;totalSpent:number;purchases:number;lastPurchase?:string};
export type Expense={id:string;description:string;category:string;amount:number;date:string};
export type User={id:string;name:string;email:string;password:string;role:'owner'|'manager'|'seller'};
export type DB={business:{name:string;currency:string};users:User[];products:Product[];sales:Sale[];customers:Customer[];expenses:Expense[];stockMovements:any[]};

const file=path.join(process.cwd(),'server','data','db.json');
const id=()=>Math.random().toString(36).slice(2,10);
const today=new Date();
const iso=(days=0)=>new Date(today.getTime()-days*86400000).toISOString();
function seed():DB {
 const products:Product[]=[
  ['African Print Tote','BAG-001','Bags',18500,10200,24,8],['Leather Slides','SHO-014','Footwear',28000,16700,6,10],['Adire Shirt','APP-021','Apparel',32500,19000,18,6],['Scented Candle','HOM-008','Home',9500,4200,4,8],['Canvas Backpack','BAG-017','Bags',24000,13500,15,5],['Woven Basket','HOM-012','Home',14000,7000,0,4]
 ].map((p,i)=>({id:`p${i+1}`,name:p[0] as string,sku:p[1] as string,category:p[2] as string,price:p[3] as number,cost:p[4] as number,stock:p[5] as number,threshold:p[6] as number,status:'active'}));
 const customers:Customer[]=[{id:'c1',name:'Amara Okafor',phone:'+234 803 555 0182',email:'amara@example.com',totalSpent:156500,purchases:7,lastPurchase:iso(1)},{id:'c2',name:'Tunde Adebayo',phone:'+234 706 122 4501',email:'tunde@example.com',totalSpent:92000,purchases:4,lastPurchase:iso(3)},{id:'c3',name:'Zainab Musa',phone:'+234 811 920 1134',email:'zainab@example.com',totalSpent:43000,purchases:2,lastPurchase:iso(8)}];
 const sales:Sale[]=[]; for(let i=0;i<18;i++){const p=products[i%products.length];const qty=i%3+1; sales.push({id:id(),number:`SAL-${String(1048-i).padStart(4,'0')}`,createdAt:iso(i%12),sellerId:'u2',sellerName:i%3?'Kemi A.':'Daniel O.',customerId:i%2?'c1':undefined,customerName:i%2?'Amara Okafor':undefined,payment:(['cash','card','transfer'] as const)[i%3],total:p.price*qty,profit:(p.price-p.cost)*qty,items:[{productId:p.id,name:p.name,qty,price:p.price}]});}
 return {business:{name:'Aster & Loom',currency:'NGN'},users:[{id:'u1',name:'Bolanle James',email:'owner@oikonos.app',password:bcrypt.hashSync('password',10),role:'owner'},{id:'u2',name:'Kemi Adeyemi',email:'seller@oikonos.app',password:bcrypt.hashSync('password',10),role:'seller'}],products,sales,customers,expenses:[{id:'e1',description:'Shop rent',category:'Rent',amount:180000,date:iso(5)},{id:'e2',description:'Instagram advertising',category:'Marketing',amount:65000,date:iso(2)},{id:'e3',description:'Generator fuel',category:'Utilities',amount:32000,date:iso(1)}],stockMovements:[]};
}
let db:DB;
export function load(){if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});db=seed();save();}else db=JSON.parse(fs.readFileSync(file,'utf8'));return db;}
export function get(){return db||load();}
export function save(){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,file);}
export {id};
