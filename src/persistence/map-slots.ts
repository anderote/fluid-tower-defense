import {campaignMap} from '../content/levels.ts';
import {DAM_ID} from '../content/dam.ts';

/** Preserve existing browser slots while resolving the map at the time of saving. */
export function mapSaveKey(mapId:string,slot:'autosave'|'checkpoint'='autosave'):string {
  const prefix=mapId===campaignMap(1).id?'pressure-front':mapId===DAM_ID?'pressure-front.dam':`pressure-front.${mapId}`;
  return `${prefix}.${slot}.v1`;
}

/** Earlier campaign sessions could save a later map under the entry map's key. */
export function migrateMapSlots(storage:Pick<Storage,'getItem'|'setItem'>,mapIds:readonly string[]):void {
  for(const slot of ['autosave','checkpoint'] as const){
    for(const source of new Set([`pressure-front.${slot}.v1`,...mapIds.map(id=>mapSaveKey(id,slot))])){
      try{
        const raw=storage.getItem(source);if(!raw)continue;
        const saved=JSON.parse(raw),id=saved?.map?.id;
        if(typeof id!=='string'||!id||typeof saved.runState!=='string')continue;
        const destination=mapSaveKey(id,slot);
        if(source!==destination&&storage.getItem(destination)===null)storage.setItem(destination,raw);
      }catch{/* Leave the original untouched if storage is unavailable or malformed. */}
    }
  }
}
