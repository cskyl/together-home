import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'data','backups',`home-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true});
const source=new DatabaseSync(resolve(root,'data','home.sqlite'),{readOnly:true});
try{await backup(source,target);}finally{source.close();}
const copy=new DatabaseSync(target,{readOnly:true});
try{
  if(copy.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup integrity check failed');
  console.log(`Verified SQLite backup: ${target}`);
}finally{copy.close();}
