const towers=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator','crusher'];
const simple=['start-wave','pause','slam-gates','dam-north','dam-south','dam-flood','skip-wave','continue-run','finish-run','wall-tool','fence-tool','wire-tool','demolish-tool','upgrade-tool','move','set-ground-target','clear-ground-target','sell','save','load','restart-wave','reset','new-game'];
export function validAction(a){
 if(!a||typeof a!=='object')return false;
 if(simple.includes(a.type))return true;
 if(a.type==='select-tower')return a.kind===null||towers.includes(a.kind);
 if(a.type==='unlock-tower')return towers.includes(a.kind);
 if(['upgrade','upgrade-tower'].includes(a.type))return [0,1].includes(a.branch)&&(a.type==='upgrade'||Number.isSafeInteger(a.id)&&a.id>0);
 if(['buy-command','buy-stat','bonus'].includes(a.type))return typeof a.id==='string'&&/^[a-z0-9-]{1,80}$/.test(a.id);
 if(a.type==='heatmap')return typeof a.value==='boolean';
 return false;
}
export function validRemoteCommand(c){
 if(!c||typeof c!=='object')return false;
 if(c.type==='action')return validAction(c.action);
 if(c.type==='infantry')return ['build','unlock-era','rally','production','training','defense','sell','deselect'].includes(c.action)&&(c.action!=='build'||['rifle','rocket','flame','samurai','dog','phalanx','archer','musketeer','grenadier','skirmisher','machinegun','assault','paratrooper','commando','marksman','support','slinger','light','raider','semiauto','bazooka'].includes(c.kind))&&(c.action!=='unlock-era'||['napoleonic','ww1','ww2','modern'].includes(c.kind));
 if(c.type==='key')return ['Escape',' '].includes(c.key);
 if(c.type==='pan')return Number.isFinite(c.dx)&&Number.isFinite(c.dy)&&Math.abs(c.dx)<=50&&Math.abs(c.dy)<=50;
 if(c.type==='pointer'||c.type==='zoom')return Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1&&Number.isSafeInteger(c.frame)&&(c.type==='zoom'?Number.isFinite(c.factor)&&c.factor>=.5&&c.factor<=2:['pointerdown','pointermove','pointerup','dblclick'].includes(c.phase)&&[0,2].includes(c.button)&&[0,1,2].includes(c.buttons)&&typeof c.shiftKey==='boolean');
 return false;
}
export function validFrame(f){return f&&Number.isSafeInteger(f.id)&&typeof f.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f.image)&&typeof f.status==='string'&&f.status.length<2000&&f.ui&&typeof f.ui==='object';}
