/** Test-only R2 substitute; never imported by the deployed Worker. */
export class MemoryBucket {
 objects=new Map();
 async put(key,value){this.objects.set(key,{value,uploaded:new Date()});}
 async get(key){const item=this.objects.get(key);return item?{key,uploaded:item.uploaded,json:async()=>JSON.parse(item.value)}:null;}
 async head(key){const item=this.objects.get(key);return item?{key,uploaded:item.uploaded}:null;}
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.objects.delete(key);}
 async list({prefix,limit=1000}){return {objects:[...this.objects].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,item])=>({key,uploaded:item.uploaded}))};}
}
