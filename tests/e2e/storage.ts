const savePrefix='pressure-front.';
const backupKey='pressure-front-e2e.backup.v1';
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
function saveKeys(storage:Store){return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((key):key is string=>!!key&&key.startsWith(savePrefix));}

export function backupSaves(storage:Store){
  if(storage.getItem(backupKey)!==null)throw new Error('An interrupted run needs save recovery first.');
  const entries=saveKeys(storage).map(key=>[key,storage.getItem(key)!]);
  // Persist the backup before the suite is allowed to modify any game saves.
  storage.setItem(backupKey,JSON.stringify(entries));
}
export function restoreSaves(storage:Store):boolean{
  const raw=storage.getItem(backupKey);if(raw===null)return false;
  const entries:unknown=JSON.parse(raw);
  if(!Array.isArray(entries)||!entries.every(entry=>Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'&&entry[0].startsWith(savePrefix)&&typeof entry[1]==='string'))throw new Error('Invalid E2E save backup; leaving it untouched.');
  for(const key of saveKeys(storage))storage.removeItem(key);
  for(const [key,value] of entries)storage.setItem(key,value);
  // If restoration fails midway, retain the backup so the next visit can retry.
  storage.removeItem(backupKey);return true;
}
