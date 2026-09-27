// Original inline icon artwork; matches the defense tools' monochrome command UI.
export const researchGroups = [
  {name:'Ballistics & optics',ids:['ballistics','rifle-tech','precision-optics']},
  {name:'Flame & explosives',ids:['thermal-science','flame-tech','explosive-ordnance','high-explosives']},
  {name:'Energy & field control',ids:['energy-systems','chain-conduction','field-control','tesla-overload']},
  {name:'Armor & fortifications',ids:['infantry-armor','structure-armor','fortified-core']},
  {name:'Command & salvage',ids:['targeting-grid','salvage-magnets']},
];
const artwork:Record<string,string> = {
  'ballistics':'<path d="M9 18V9l3-6 3 6v9zM8 21h8M9 14h6"/>',
  'rifle-tech':'<path d="m3 19 5-5-2-2 10-6 2 2-7 7-2-1-4 7M17 7l4-4M12 13l2 4"/>',
  'precision-optics':'<circle cx="12" cy="12" r="7"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
  'thermal-science':'<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0M12 9v9M17 6h3m-3 4h2"/>',
  'flame-tech':'<path d="M12 2c2 6-4 7-2 11 2-1 3-3 3-5 5 4 7 7 5 11-3 5-12 3-12-3 0-4 4-7 6-14Z"/>',
  'explosive-ordnance':'<path d="m8 8 3-3 8 8-3 3zM5 11l8 8-5 2-5-5zM18 6l3-3m-5 1V1m5 7h3"/>',
  'high-explosives':'<path d="m12 2 2 6 6-3-3 6 5 3-7 1 1 7-5-5-5 4 1-7-5-3 7-1z"/>',
  'energy-systems':'<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
  'chain-conduction':'<circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="12" cy="20" r="2"/><path d="m6 6 5 3-3 3 6 2-1 4M18 6l-4 3"/>',
  'field-control':'<circle cx="12" cy="12" r="3"/><path d="M6 5a9 9 0 0 0 0 14M18 5a9 9 0 0 1 0 14M3 2a13 13 0 0 0 0 20M21 2a13 13 0 0 1 0 20"/>',
  'tesla-overload':'<path d="m11 2-4 7h5l-2 6 7-10h-5l2-3M6 17h12M8 20h8M5 23h14M3 10l2 3m16-3-2 3"/>',
  'infantry-armor':'<path d="m8 3 4 3 4-3 5 5-4 4v9H7v-9L3 8zM9 10h6m-6 4h6m-6 4h6"/>',
  'structure-armor':'<path d="M3 6h18v15H3zM3 13h18M9 6v7m6 0v8M3 3h4m3 0h4m3 0h4"/>',
  'fortified-core':'<path d="m12 2 9 4v7c0 5-9 9-9 9s-9-4-9-9V6zM8 10h8v7H8zM10 10V7h4v3"/>',
  'targeting-grid':'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M12 6v12M6 12h12"/><circle cx="12" cy="12" r="4"/>',
  'salvage-magnets':'<path d="M4 3v10a8 8 0 0 0 16 0V3h-5v10a3 3 0 0 1-6 0V3zM4 8h5m6 0h5"/>',
};
export const researchIcon=(id:string)=>`<svg class="research-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${artwork[id]??artwork['targeting-grid']}</svg>`;
