import {execFileSync} from 'node:child_process';
import {cp,mkdir,stat,rm} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
const source=process.cwd(),target=resolve(process.argv[2]||'../../ishare');
if(target===source||target.startsWith(source+sep))throw new Error('Source mirror checkout must be outside this site');
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','ishare.js.gripe'],{cwd:resolve(source,'..'),encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const path of tracked){
  const from=resolve(source,'..',path),name=relative(source,from),destination=resolve(target,name);
  if(name.startsWith('..'+sep)||relative(target,destination).startsWith('..'+sep))throw new Error('Source path escaped site');
  try{await stat(from);}catch(error){if(error.code!=='ENOENT')throw error;await rm(destination,{force:true});continue;}
  await mkdir(resolve(destination,'..'),{recursive:true});await cp(from,destination);
}
console.log('Synchronized the complete ishare source mirror. Review and commit the target checkout directly to main.');
