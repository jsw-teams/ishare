import {execFileSync} from 'node:child_process';
import {cp,mkdir} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
const source=process.cwd(),target=resolve(process.argv[2]||'../../ishare');
if(target===source||target.startsWith(source+sep))throw new Error('Source mirror checkout must be outside this site');
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','share.js.gripe'],{cwd:resolve(source,'..'),encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const path of tracked){const from=resolve(source,'..',path),name=relative(source,from);if(name.startsWith('..'+sep))throw new Error('Source path escaped site');await mkdir(resolve(target,name,'..'),{recursive:true});await cp(from,resolve(target,name));}
console.log('Synchronized the complete ishare source mirror. Review and commit the target checkout directly to main.');
