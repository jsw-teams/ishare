import { DatabaseSync } from 'node:sqlite';
import { Repository } from '../backend/cloudflare/store.js';
import {defaults} from '../backend/cloudflare/quotas.js';
import { digest, random } from '../backend/cloudflare/security.js';
export function repository(){
  const database=new DatabaseSync(':memory:');
  const sql={exec(query,...args){if(!args.length&&query.includes(';')){database.exec(query);return [];}return database.prepare(query).all(...args);}};
  const atomic=fn=>{database.exec('BEGIN');try{const result=fn();database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}};
  return {store:new Repository(sql,atomic),database};
}
export const now=()=>Math.floor(Date.now()/1000);
export const media=(overrides={})=>({id:'a'.repeat(32),owner:'42',author:{id:'42',login:'publisher',name:'Publisher'},kind:'image',title:'Example <script>',sourceUrl:'https://source.example/article',sourceName:'Source',bytes:1024,mime:'image/png',duration:0,...overrides});
export const limits={images:2,videoSeconds:120,daily:10,defaults:{...defaults(),dailyUploads:5},ownerId:'99'};
export function environment(store){return {SHARE_STORE:{get:()=>store,idFromName:name=>name},MEDIA_API_TOKEN:'image-secret-token',STREAM_ACCOUNT_ID:'b'.repeat(32),PUBLISHER_IDS:'42'};}
export async function login(store,user={id:'42',login:'publisher',name:'Publisher'}){const token=random(),csrf=random();store.makeSession(await digest(token),user,csrf,now());return {cookie:'__Host-ishare-session='+token,csrf};}
export function request(action,{cookie,csrf,resource,body,origin='https://ishare.js.gripe',method}={}){const headers={'X-Service-Action':action,Origin:origin};if(cookie)headers.Cookie=cookie;if(csrf)headers['X-CSRF-Token']=csrf;if(resource)headers['X-Service-Resource']=encodeURIComponent(resource);if(body)headers['Content-Type']='application/json';return new Request('https://ishare.js.gripe/api',{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined});}
