/** Remote room data may reach existing UI templates. Escape text before rendering it. */
export function safeSnapshot<T>(value:T):T {
 if(typeof value==='string')return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!)) as T;
 if(Array.isArray(value))return value.map(safeSnapshot) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,safeSnapshot(item)])) as T;
 return value;
}
