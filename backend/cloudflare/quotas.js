import { fail } from './security.js';

export const quotaFields=['images','videoSeconds','dailyUploads','videoDuration'];
export function defaults() {return {images:1000,videoSeconds:3600,dailyUploads:50,videoDuration:600};}
export function settingsChange(body){
  if(!body||Object.keys(body).some(k=>!['defaults','shared','note','urgent'].includes(k))||typeof body.note!=='string'||!body.note.trim()||body.note.length>500||body.urgent!==undefined&&typeof body.urgent!=='boolean')fail('invalid_field');
  for(const [section,keys]of [['defaults',quotaFields],['shared',['images','videoSeconds','daily']]]){const value=body[section];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>value[k]!==null&&(!Number.isSafeInteger(value[k])||value[k]<0)))fail('invalid_quota');}
  return body;
}
export function policy(record,base,owner=false) {
  const saved=JSON.parse(record?.policy||'{}');return {blocked:owner?false:!!record?.blocked,sharingBlocked:owner?false:saved.sharingBlocked===true,unlimited:owner,limits:owner?Object.fromEntries(quotaFields.map(k=>[k,null])):Object.fromEntries(quotaFields.map(k=>[k,Object.hasOwn(saved,k)?saved[k]:base[k]]))};
}
export function accountId(value){if(typeof value!=='string'||! /^[1-9][0-9]{0,19}$/.test(value))fail('invalid_user');return value;}
export function changes(body){
  for(const key of Object.keys(body))if(!['blocked','sharingBlocked','limits','note','reset','urgent'].includes(key))fail('invalid_field');
  if(body.blocked!==undefined&&typeof body.blocked!=='boolean')fail('invalid_field');
  if(body.sharingBlocked!==undefined&&typeof body.sharingBlocked!=='boolean')fail('invalid_field');
  if(body.reset!==undefined&&typeof body.reset!=='boolean')fail('invalid_field');
  if(body.urgent!==undefined&&typeof body.urgent!=='boolean')fail('invalid_field');
  if(body.note!==undefined&&(typeof body.note!=='string'||body.note.length>500))fail('invalid_field');
  if(!body.note?.trim())fail('reason_required');
  if(body.limits!==undefined){if(!body.limits||typeof body.limits!=='object'||Array.isArray(body.limits))fail('invalid_field');for(const [key,n]of Object.entries(body.limits))if(!quotaFields.includes(key)||(n!==null&&(!Number.isSafeInteger(n)||n<0)))fail('invalid_quota');}
  return body;
}
export function exceeds(value,max){return max!==null&&max!==undefined&&value>max;}
