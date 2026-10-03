import { random, fail } from './security.js';
import { policy, exceeds } from './quotas.js';
const monthDue=now=>{const date=new Date(now*1000),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end));return Math.floor(date.getTime()/1000);};

export class Repository {
  constructor(sql, atomic) {
    this.sql=sql;this.atomic=atomic;
    sql.exec(`CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, author TEXT NOT NULL, kind TEXT NOT NULL,
      title TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL, source_name TEXT NOT NULL,
      bytes INTEGER NOT NULL, mime TEXT NOT NULL, duration INTEGER NOT NULL,
      provider_id TEXT, upload_url TEXT, state TEXT NOT NULL, created INTEGER NOT NULL,
      expires INTEGER NOT NULL, published INTEGER, lease INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS media_owner ON media(owner,created);
    CREATE INDEX IF NOT EXISTS media_state ON media(state,expires);
    CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, identity TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, identity TEXT NOT NULL, policy TEXT NOT NULL DEFAULT '{}', blocked INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, pending TEXT, effective INTEGER, erasing INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, target TEXT NOT NULL, changes TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rights (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, state TEXT NOT NULL, response TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, due INTEGER NOT NULL, resolved INTEGER);`);
  }
  one(query,...args) { return [...this.sql.exec(query,...args)][0]||null; }
  get(id) { return this.one('SELECT * FROM media WHERE id=?',id); }
  key() { return this.atomic(()=>{let key=this.one("SELECT value FROM settings WHERE id='delivery-key'")?.value;if(!key){key=random();this.sql.exec("INSERT INTO settings VALUES ('delivery-key',?)",key);}return key;}); }
  videoToken(id,now) {const row=this.one('SELECT value FROM settings WHERE id=?','video:'+id);if(!row)return null;const value=JSON.parse(row.value);return value.expires>now?value.token:null;}
  saveVideoToken(id,token,expires) {this.sql.exec('INSERT INTO settings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value','video:'+id,JSON.stringify({token,expires}));}
  rate(key,max,now,period=600) {
    return this.atomic(()=>{const k=key+':'+Math.floor(now/period);const row=this.one('SELECT count FROM limits WHERE id=?',k);if((row?.count||0)>=max)fail('rate_limited',429);this.sql.exec('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',k,now+period*2);});
  }
  beginAuth(hash,verifier,now) { this.sql.exec('INSERT INTO auth VALUES (?,?,?)',hash,verifier,now+600); }
  consumeAuth(hash,now) { const record=this.one('DELETE FROM auth WHERE id=? RETURNING *',hash);return record?.expires>now?record.verifier:undefined; }
  makeSession(hash,identity,csrf,now) { this.sql.exec('INSERT INTO sessions VALUES (?,?,?,?)',hash,JSON.stringify(identity),csrf,now+86400);this.sql.exec('INSERT INTO users(id,identity,updated) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET identity=excluded.identity',identity.id,JSON.stringify(identity),now); }
  session(hash,now) { const row=this.one('SELECT * FROM sessions WHERE id=? AND expires>?',hash,now);return row?{user:JSON.parse(row.identity),csrf:row.csrf}:null; }
  logout(hash) { this.sql.exec('DELETE FROM sessions WHERE id=?',hash); }
  usage(owner,now) {return {...this.one("SELECT coalesce(sum(bytes),0) AS storageBytes, coalesce(sum(CASE WHEN kind='image' THEN 1 ELSE 0 END),0) AS images, coalesce(sum(CASE WHEN kind='video' THEN duration ELSE 0 END),0) AS videoSeconds FROM media WHERE owner=? AND state NOT IN ('deleted','failed')",owner),dailyUploads:this.one('SELECT count(*) AS n FROM media WHERE owner=? AND created>=?',owner,now-now%86400).n};}
  activate(owner,now){const row=this.one('SELECT * FROM users WHERE id=?',owner);if(row?.pending&&row.effective<=now){const next=JSON.parse(row.pending);this.sql.exec('UPDATE users SET policy=?,blocked=?,pending=NULL,effective=NULL WHERE id=?',JSON.stringify(next.limits),Number(next.blocked),owner);}return this.one('SELECT * FROM users WHERE id=?',owner);}
  account(owner,base,ownerId,now) {const row=this.activate(owner,now),p=policy(row,base,owner===ownerId),month=new Date(now*1000).toISOString().slice(0,7);return {id:owner,identity:row?JSON.parse(row.identity):null,...p,blocked:p.blocked||!!row?.erasing,erasing:!!row?.erasing,usage:{...this.usage(owner,now),imageDeliveries:this.one('SELECT count FROM limits WHERE id=?','delivery:image:'+owner+':'+month)?.count||0,videoDeliverySeconds:(this.one('SELECT count FROM limits WHERE id=?','delivery:video:'+owner+':'+month)?.count||0)/1000},notice:row?.pending?{limits:{...base,...JSON.parse(row.pending).limits},blocked:JSON.parse(row.pending).blocked,effective:row.effective}:null,note:row?.note||''};}
  users(cursor,base,ownerId,now) {const rows=[...this.sql.exec('SELECT id FROM users WHERE id>? ORDER BY id LIMIT 51',cursor||'')];return {items:rows.slice(0,50).map(row=>this.account(row.id,base,ownerId,now)),next:rows.length>50?rows[49].id:null};}
  setAccount(owner,change,actor,ownerId,now,base) {return this.atomic(()=>{if(owner===ownerId)fail('owner_protected',409);const row=this.activate(owner,now);if(!row)fail('not_found',404);const current={...base,...JSON.parse(row.policy)},next=change.reset?{}:{...JSON.parse(row.policy),...change.limits},target={...base,...next},blocked=change.blocked===undefined?!!row.blocked:change.blocked;const reducing=(blocked&&!row.blocked)||Object.keys(current).some(key=>target[key]!==null&&(current[key]===null||target[key]<current[key]));const effective=reducing&&!change.urgent?now+604800:now;this.sql.exec('UPDATE users SET policy=?,blocked=?,note=?,updated=?,pending=?,effective=? WHERE id=?',effective>now?row.policy:JSON.stringify(next),effective>now?row.blocked:Number(blocked),change.note,now,effective>now?JSON.stringify({limits:next,blocked}):null,effective>now?effective:null,owner);this.sql.exec('INSERT INTO audit(actor,target,changes,created) VALUES (?,?,?,?)',actor,owner,JSON.stringify({...change,effective}),now);return {ok:true,effective};});}
  audit() {return [...this.sql.exec('SELECT actor,target,changes,created FROM audit ORDER BY id DESC LIMIT 50')].map(row=>({...row,changes:JSON.parse(row.changes)}));}
  assertPublisher(owner,ownerId) {const row=this.activate(owner,Math.floor(Date.now()/1000));if(row?.erasing||(owner!==ownerId&&row?.blocked))fail('publishing_suspended',403);}
  delivery(owner,kind,amount,now) {return this.atomic(()=>{const month=new Date(now*1000).toISOString().slice(0,7),scale=kind==='image'?1:1000,n=Math.ceil(amount*scale);for(const key of ['delivery:'+kind+':'+owner+':'+month,'delivery:'+kind+':all:'+month])this.sql.exec('INSERT INTO limits VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET count=count+excluded.count',key,n,now+5356800);});}
  rights(owner){return [...this.sql.exec('SELECT * FROM rights WHERE owner=? ORDER BY created DESC LIMIT 100',owner)];}
  requestRight(owner,kind,message,now){return this.atomic(()=>{const id=random(),due=monthDue(now);this.sql.exec("INSERT INTO rights(id,owner,kind,message,state,created,due) VALUES (?,?,?,?,'open',?,?)",id,owner,kind,message,now,due);return {id,due};});}
  rightsQueue(){return [...this.sql.exec("SELECT * FROM rights WHERE state='open' ORDER BY due LIMIT 100")];}
  resolveRight(id,response,actor,now){const row=this.one("SELECT * FROM rights WHERE id=? AND state='open'",id);if(!row)fail('not_found',404);this.sql.exec("UPDATE rights SET state='resolved',response=?,resolved=? WHERE id=?",response,now,id);this.sql.exec('INSERT INTO audit(actor,target,changes,created) VALUES (?,?,?,?)',actor,row.owner,JSON.stringify({request:id,response}),now);}
  erase(owner,now){const row=this.one('SELECT erasing FROM users WHERE id=?',owner);if(!row?.erasing)this.requestRight(owner,'delete','Delete account and all media',now);this.sql.exec('UPDATE users SET erasing=1,blocked=1,updated=? WHERE id=?',now,owner);this.sql.exec("UPDATE media SET state='deleting',lease=0 WHERE owner=? AND state NOT IN ('deleted','failed','uncertain','preparing')",owner);return {ok:true,pending:true};}
  reserve(data,limits,now) {
    return this.atomic(()=>{
      const day=now-now%86400,isOwner=data.owner===limits.ownerId;
      const user=this.account(data.owner,limits.defaults,limits.ownerId,now);this.assertPublisher(data.owner,limits.ownerId);
      if(exceeds(user.usage.dailyUploads+1,user.limits.dailyUploads))fail('upload_quota',429);
      if(exceeds(user.usage.images+(data.kind==='image'?1:0),user.limits.images)||exceeds(user.usage.videoSeconds+data.duration,user.limits.videoSeconds))fail('storage_quota',429);
      if(data.kind==='video'&&(exceeds(data.duration,user.limits.videoDuration)||exceeds(data.bytes,user.limits.videoBytes)))fail('upload_quota',429);
      if(!isOwner){
        if(this.one('SELECT count(*) AS n FROM media WHERE owner!=? AND created>=?',limits.ownerId||'',day).n>=limits.daily||this.one("SELECT count(*) AS n FROM media WHERE owner=? AND state IN ('preparing','uploading')",data.owner).n>=3)fail('upload_quota',429);
        if(data.kind==='image'&&this.one("SELECT count(*) AS n FROM media WHERE owner!=? AND kind='image' AND state NOT IN ('deleted','failed')",limits.ownerId||'').n>=limits.images)fail('storage_quota',429);
        if(data.kind==='video'&&(this.one("SELECT coalesce(sum(duration),0) AS n FROM media WHERE owner!=? AND kind='video' AND state NOT IN ('deleted','failed')",limits.ownerId||'').n+data.duration)>limits.videoSeconds)fail('storage_quota',429);
      }
      this.sql.exec('INSERT INTO users(id,identity,updated) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING',data.owner,JSON.stringify(data.author),now);
      const values=[data.id,data.owner,JSON.stringify(data.author),data.kind,data.title,data.caption||'',data.sourceUrl,data.sourceName,data.bytes,data.mime,data.duration,now,now+86400];
      this.sql.exec("INSERT INTO media(id,owner,author,kind,title,caption,source_url,source_name,bytes,mime,duration,state,created,expires) VALUES (?,?,?,?,?,?,?,?,?,?,?,'preparing',?,?)",...values);
      return this.get(data.id);
    });
  }
  attach(id,providerId,url,now) { this.sql.exec("UPDATE media SET provider_id=?,upload_url=?,state='uploading',expires=? WHERE id=? AND state='preparing'",providerId,url,now+86400,id);return this.get(id); }
  failed(id) { this.sql.exec("UPDATE media SET state='failed' WHERE id=? AND state='preparing'",id); }
  uncertain(id) { this.sql.exec("UPDATE media SET state='uncertain' WHERE id=? AND state='preparing'",id); }
  reconcile(id,actor,note,now){return this.atomic(()=>{const item=this.get(id);if(!item||item.state!=='uncertain')fail('invalid_state',409);this.sql.exec("UPDATE media SET state='failed',upload_url=NULL,provider_id=NULL WHERE id=?",id);this.sql.exec('INSERT INTO audit(actor,target,changes,created) VALUES (?,?,?,?)',actor,item.owner,JSON.stringify({reconciled:id,note}),now);return {ok:true};});}
  publish(id,owner,duration,now,ownerId) {
    return this.atomic(()=>{this.assertPublisher(owner,ownerId);const item=this.get(id);if(!item||item.owner!==owner)fail('not_found',404);if(item.state==='published')return item;if(item.state!=='uploading')fail('invalid_state',409);if(duration>item.duration)fail('invalid_duration',409);this.sql.exec("UPDATE media SET state='published',duration=?,published=?,upload_url=NULL WHERE id=?",duration,now,id);return this.get(id);});
  }
  list(owner,cursor='') {const rows=[...this.sql.exec("SELECT * FROM media WHERE owner=? AND id>? AND state NOT IN ('deleted','failed') ORDER BY id LIMIT 51",owner,cursor)];return {items:rows.slice(0,50),next:rows.length>50?rows[49].id:null};}
  markDelete(id,owner,admin=false) { return this.atomic(()=>{const item=this.get(id);if(!item||(!admin&&item.owner!==owner))fail('not_found',404);if(item.state==='preparing')fail('upload_in_progress',409);this.sql.exec("UPDATE media SET state='deleting' WHERE id=?",id);return item;}); }
  deleted(id) { this.sql.exec("UPDATE media SET state='deleted',upload_url=NULL,provider_id=NULL WHERE id=? AND state='deleting'",id);this.sql.exec('DELETE FROM settings WHERE id=?','video:'+id); }
  cleanup(now) {
    return this.atomic(()=>{
      for(const table of ['sessions','auth','limits'])this.sql.exec(`DELETE FROM ${table} WHERE expires<?`,now);
      this.sql.exec('DELETE FROM audit WHERE created<?',now-7776000);
      this.sql.exec("DELETE FROM rights WHERE state='resolved' AND resolved<?",now-7776000);
      for(const user of this.sql.exec('SELECT id FROM users WHERE erasing=1')){if(!this.one("SELECT count(*) AS n FROM media WHERE owner=? AND state NOT IN ('deleted','failed')",user.id).n){this.sql.exec('DELETE FROM media WHERE owner=?',user.id);this.sql.exec('DELETE FROM sessions WHERE json_extract(identity,\'$.id\')=?',user.id);this.sql.exec('DELETE FROM rights WHERE owner=?',user.id);this.sql.exec('DELETE FROM audit WHERE actor=? OR target=?',user.id,user.id);this.sql.exec('DELETE FROM limits WHERE id LIKE ? OR id LIKE ?','delivery:%:'+user.id+':%','%:'+user.id+':%');this.sql.exec('DELETE FROM users WHERE id=?',user.id);}}
      this.sql.exec("DELETE FROM media WHERE state IN ('failed','deleted') AND created<?",now-2592000);
      this.sql.exec("UPDATE media SET state='uncertain' WHERE state='preparing' AND created<?",now-3600);
      this.sql.exec("UPDATE media SET state='deleting',lease=0 WHERE owner IN (SELECT id FROM users WHERE erasing=1) AND state='uploading'");
      const items=[...this.sql.exec("SELECT * FROM media WHERE (state='deleting' OR (state='uploading' AND expires<?)) AND lease<? LIMIT 25",now,now)];
      for(const item of items)this.sql.exec("UPDATE media SET state='deleting',lease=? WHERE id=?",now+300,item.id);
      return items;
    });
  }
}
