import {wavePressure,WAVE_PEAK_PRESSURE} from './wave-rhythm.ts';
import {canFinishWaveEarly} from './wave-progress.ts';
import {COMMAND_UPGRADES, compileTower, DEFAULT_MAP, MAX_TOWER_LEVEL, MAX_VETERANCY, TOWERS, towerUpgradeCost, veterancyLevel} from '../content/index.ts';
import {crusherPassageIssue,hasSpawnRoute,canPlace, mapWithTurretObstacles, resolvePlacement} from '../navigation/index.ts';
import {commandUpgradeAvailability,researchCost,researchRank} from './research.ts';
import {freshInfantry,validInfantry,infantryMap} from '../infantry/model.ts';
import type {Effect,BonusChoice, StatUpgrade, Rect, RunModel, Settlement, SpawnBatch, Tower, TowerKind, TowerUnlock, Vec2, WorldMap} from '../contracts/index.ts';

export type ActionResult = {ok:true} | {ok:false; reason:string};
export type PlaceResult = ActionResult & {tower?:Tower};
export type Wave = {spawns:readonly SpawnBatch[]; payment:number; boss:boolean; total:number; healthScale:number; peakRate:number; rampSeconds:number};
type Applied = Pick<Settlement,'kills'|'crushKills'|'leaks'|'earned'> & {tick:number;towerKills:number[]};
type SavedRun = {version:1; contentVersion:string; mapId?:string; model:RunModel; epoch:number; applied:Applied};

export const CONTENT_VERSION = 'pressure-front-8';
const SAVE_KEY = 'pressure-front.run.v1';
const MAX_TOWERS = 64;
export const WAVES_PER_LEVEL=10;
export const STARTING_METAL=3_000;
/** Flat redeployment charge; upgrades and accumulated investment stay with the tower. */
export const TOWER_MOVE_COST=25;
const STARTER_TOWERS:readonly TowerKind[]=Object.freeze(Object.keys(TOWERS) as TowerKind[]);
const TOWER_UNLOCK_COSTS:Readonly<Partial<Record<TowerKind,number>>>=Object.freeze({mortar:3_000,cryo:4_000,tesla:6_000,incinerator:7_500,rocket:9_000,railgun:12_000});
const BONUSES: readonly BonusChoice[] = [
  {id:'hydraulic-advantage',name:'Hydraulic Advantage',description:'Repulsors push harder but pulse a little slower.'},
  {id:'cold-field',name:'Cold Field',description:'Cryo emitters cover a wider field.'},
  {id:'salvage-contract',name:'Salvage Contract',description:'Gain 35 Metal now.'},
  {id:'kinetic-feed',name:'Kinetic Feed',description:'Autocannons fire 15% faster.'},
  {id:'blast-casing',name:'Blast Casing',description:'Mortars and rocket pods deal 15% more damage.'},
];
const emptyApplied = ():Applied => ({kills:0,crushKills:0,leaks:0,earned:0,tick:-1,towerKills:Array(MAX_TOWERS).fill(0)});
const isFiniteInteger = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
const isNonNegative = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isTowerKind = (value:unknown):value is TowerKind => typeof value === 'string' && Object.hasOwn(TOWERS,value);
const copy = (model:RunModel):RunModel => ({...model,towers:model.towers.map(t=>({...t,...(t.groundTarget?{groundTarget:{...t.groundTarget}}:{})})),pending:model.pending.map(b=>({...b})),bonusChoices:model.bonusChoices.map(b=>({...b})),bonuses:[...model.bonuses],commandUpgrades:[...model.commandUpgrades],unlockedTowers:[...model.unlockedTowers],statRanks:{...model.statRanks}});
const fresh = ():RunModel => ({phase:'preparation',metal:STARTING_METAL,salvageCredit:0,baseHealth:20,level:1,wave:0,waveCount:WAVES_PER_LEVEL,towers:[],selected:null,pending:[],bonusChoices:[],bonuses:[],commandUpgrades:[],unlockedTowers:[...STARTER_TOWERS],statRanks:{}});

const PHASE_WEIGHTS:readonly (readonly [SpawnBatch['kind'],number])[][]=[
  [['shambler',.65],['runner',.15],['husk',.12],['brute',.04],['rager',.02],['softbody',.02]],
  [['shambler',.55],['runner',.2],['husk',.12],['brute',.06],['rager',.05],['softbody',.02]],
  [['shambler',.45],['runner',.18],['husk',.2],['brute',.08],['rager',.06],['softbody',.03]],
  [['shambler',.4],['runner',.2],['husk',.15],['brute',.1],['rager',.1],['softbody',.05]],
  [['shambler',.35],['runner',.18],['husk',.18],['brute',.12],['rager',.1],['softbody',.07]],
  [['shambler',.46],['runner',.13],['brute',.12],['rager',.29]],
  [['shambler',.34],['runner',.25],['husk',.2],['rager',.21]],
  [['shambler',.3],['runner',.12],['brute',.16],['rager',.16],['softbody',.26]],
  [['shambler',.26],['runner',.16],['brute',.16],['rager',.16],['softbody',.13],['husk',.13]],
  [['shambler',.3],['runner',.14],['brute',.2],['rager',.16],['softbody',.12],['husk',.08]],
];
// Emit as soon as a zombie earns its place in the stream. Packet-sized bursts
// made even rate-based waves look like periodic mass spawns.
const burstFor=(_kind:SpawnBatch['kind']):number=>1;

/** Deterministic authored-pattern director with bounded population and unbounded stat scaling. */
export function waveFor(level:number,wave:number,mapId?:string):Wave {
  const globalWave=Math.max(1,Math.floor(wave>WAVES_PER_LEVEL?wave:(Math.max(1,level)-1)*WAVES_PER_LEVEL+wave));
  const threat=globalWave-1,phase=(globalWave-1)%WAVES_PER_LEVEL,cycle=Math.floor((globalWave-1)/WAVES_PER_LEVEL);
  // Larger sustained hordes share a fixed quota across all inlet widths and maps.
  const openingTotals=[5_000,10_000,15_000,25_000,50_000];
  const total=openingTotals[globalWave-1]??Math.min(250_000,50_000+(globalWave-5)*10_000);
  const healthScale=1+threat*.035;
  const seed=(globalWave*10_000+globalWave*977)>>>0;
  const weights=new Map(PHASE_WEIGHTS[phase]);
  if(cycle>0){for(const kind of ['runner','brute','rager','softbody','husk'] as const)weights.set(kind,(weights.get(kind)??0)+.025);}
  const weightTotal=[...weights.values()].reduce((sum,value)=>sum+value,0);
  const arrivalRate=Math.min(180,90+threat*6);
  const duration=total/arrivalRate;
  const spawns:SpawnBatch[]=[];
  let assigned=0,index=0;
  for(const [kind,weight] of weights){
    const last=index===weights.size-1,count=last?total-assigned:Math.round(total*weight/weightTotal);assigned+=count;
    spawns.push({kind,count,seed:seed+index*17,start:0,rate:Math.max(1,count/duration),burst:burstFor(kind),band:'inlet',healthScale});
    index++;
  }
  return {spawns,payment:Math.round(210+threat*86+Math.pow(threat,1.25)*14),boss:globalWave%WAVES_PER_LEVEL===0,total,healthScale,peakRate:total/duration*WAVE_PEAK_PRESSURE,rampSeconds:duration};
}
const offeredBonuses=(level:number,wave:number,owned:readonly string[]):BonusChoice[]=>{
  const available=BONUSES.filter(choice=>choice.id==='salvage-contract'||!owned.includes(choice.id));
  const offset=(level*7+wave*3)%available.length;
  return Array.from({length:Math.min(3,available.length)},(_,index)=>available[(offset+index)%available.length]);
};
const spentAtLevel = (kind:TowerKind, level:number):number => {
  let spent=TOWERS[kind].cost;
  for (let upgrade=0;upgrade<level;upgrade++) spent+=towerUpgradeCost(upgrade);
  return spent;
};

function validTower(map:WorldMap, tower:unknown, prior:readonly Tower[], mounts:readonly Rect[]): tower is Tower {
  if (!tower || typeof tower !== 'object') return false;
  const value=tower as Tower;
  if (!isFiniteInteger(value.id) || value.id<=0 || !isTowerKind(value.kind) || !isNonNegative(value.x) || !isNonNegative(value.y) || !isFiniteInteger(value.level) || value.level<0 || value.level>MAX_TOWER_LEVEL || !isFiniteInteger(value.branch) || ![-1,0,1].includes(value.branch) || (value.level===0 && value.branch!==-1) || (value.level>0 && value.branch===-1) || !isNonNegative(value.angle) || !isNonNegative(value.cooldown) || !isFiniteInteger(value.spent) || value.spent!==spentAtLevel(value.kind,value.level) || prior.some(other=>other.id===value.id)) return false;
  if(value.crusherRecharge!==undefined&&(!Number.isFinite(value.crusherRecharge)||value.crusherRecharge<=0))return false;
  if(value.crusherAnimation!==undefined&&(!isNonNegative(value.crusherAnimation)||value.crusherAnimation>.7))return false;
  if(value.kills!==undefined&&(!isFiniteInteger(value.kills)||value.kills<0))return false;
  if(value.veterancy!==undefined&&(!isFiniteInteger(value.veterancy)||value.veterancy<0||value.veterancy>MAX_VETERANCY))return false;
  if(value.veterancyXp!==undefined&&!isNonNegative(value.veterancyXp))return false;
  if(value.groundTarget!==undefined&&(!value.groundTarget||!Number.isFinite(value.groundTarget.x)||!Number.isFinite(value.groundTarget.y)||value.groundTarget.x<0||value.groundTarget.y<0||value.groundTarget.x>map.width||value.groundTarget.y>map.height))return false;
  return canPlace(map,prior,value,1.25,mounts);
}
function validApplied(value:unknown): value is Applied {
  if (!value || typeof value !== 'object') return false;
  const applied=value as Applied;
  return isFiniteInteger(applied.tick) && applied.tick>=-1 && isFiniteInteger(applied.kills) && applied.kills>=0 && isFiniteInteger(applied.crushKills) && applied.crushKills>=0 && isFiniteInteger(applied.leaks) && applied.leaks>=0 && isFiniteInteger(applied.earned) && applied.earned>=0 && Array.isArray(applied.towerKills) && applied.towerKills.length===MAX_TOWERS && applied.towerKills.every(value=>isFiniteInteger(value)&&value>=0);
}

export class RunController {
  readonly model:RunModel = fresh();
  private nextTowerId=1;
  private runEpoch=1;
  private applied=emptyApplied();
  private live=0;
  private carriedQuota=0;
  private spawnElapsed=0;
  private spawnAllocation=0;
  private spawnMultiplier=1;
  private spawnPeakRate=2_400;
  private waveStartBaseHealth=20;
  private map:WorldMap;
  private buildMounts:Rect[]=[];

  constructor(initialMap:WorldMap=DEFAULT_MAP) { this.map=initialMap; }

  get epoch():number { return this.runEpoch; }
  get waveProgress(){
    const queued=this.model.pending.reduce((sum,batch)=>sum+batch.count,0);
    return {total:this.model.wave>0?waveFor(this.model.level,this.model.wave,this.map.id).total+this.carriedQuota:0,queued,live:this.live};
  }
  get hasRemainingEnemies():boolean { return this.live>0||this.model.pending.length>0; }
  get spawnPressure():number {
    const {total,queued}=this.waveProgress;
    const globalWave=this.model.wave>WAVES_PER_LEVEL?this.model.wave:(this.model.level-1)*WAVES_PER_LEVEL+this.model.wave;
    return wavePressure(globalWave,total>0?1-queued/total:0);
  }
  get isBossWave():boolean { return this.model.wave>0&&this.model.wave%WAVES_PER_LEVEL===0; }
  setSpawnMultiplier(value:number):number { this.spawnMultiplier=Math.max(1,Math.min(40,Math.round(value)||1)); return this.spawnMultiplier; }

  statUpgrades():StatUpgrade[] {
    return [];
  }
  statModifiers():readonly string[] {
    return [];
  }
  researchModifiers():readonly string[] {
    return this.model.commandUpgrades;
  }
  isTowerUnlocked(kind:TowerKind):boolean { return this.model.unlockedTowers.includes(kind); }
  towerUnlocks():TowerUnlock[] {
    return (Object.keys(TOWERS) as TowerKind[]).map(kind=>({kind,cost:TOWER_UNLOCK_COSTS[kind]??0,unlocked:this.isTowerUnlocked(kind)}));
  }
  unlockTower(kind:TowerKind):ActionResult {
    if (!isTowerKind(kind)) return {ok:false,reason:'Unknown tower.'};
    if (this.isTowerUnlocked(kind)) return {ok:false,reason:'That tower is already unlocked.'};
    const cost=TOWER_UNLOCK_COSTS[kind];
    if (!cost) return {ok:false,reason:'That tower does not require research.'};
    const result=this.spendMetal(cost);
    if (!result.ok) return result;
    this.model.unlockedTowers.push(kind);
    return {ok:true};
  }
  buyStatUpgrade(id:string):ActionResult {
    return {ok:false,reason:'Research is organized through the technology tree.'};
  }

  place(kind:TowerKind, position:Vec2):PlaceResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    if (!isTowerKind(kind)) return {ok:false,reason:'Unknown tower.'};
    if (!this.isTowerUnlocked(kind)) return {ok:false,reason:'Unlock this tower with Metal first.'};
    if (this.model.towers.length>=MAX_TOWERS) return {ok:false,reason:'The tower limit has been reached.'};
    const def=TOWERS[kind];
    if (this.model.metal<def.cost) return {ok:false,reason:'Insufficient Metal.'};
    const buildMap=infantryMap(this.map,this.model.infantry??freshInfantry());
    const placement={...(kind==='crusher'?position:resolvePlacement(buildMap,position,1.25,this.buildMounts)),kind};
    if (!canPlace(buildMap,this.model.towers,placement,1.25,this.buildMounts)) return {ok:false,reason:'That position is blocked or too close to another tower.'};
    const passageIssue=kind==='crusher'?crusherPassageIssue(buildMap,this.model.towers,placement):undefined;
    if(passageIssue)return {ok:false,reason:passageIssue};
    if (!hasSpawnRoute(mapWithTurretObstacles(buildMap,[...this.model.towers,placement]))) return {ok:false,reason:'That turret would seal the zombie route to the goal.'};
    const tower:Tower={id:this.nextTowerId++,kind,x:placement.x,y:placement.y,level:0,branch:-1,angle:0,cooldown:0,spent:def.cost,kills:0,veterancy:0,veterancyXp:0};
    this.model.metal-=def.cost; this.model.towers.push(tower); this.model.selected=null;
    return {ok:true,tower};
  }
  sell(id:number):ActionResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    const index=this.model.towers.findIndex(t=>t.id===id);
    if (index<0) return {ok:false,reason:'Tower not found.'};
    const [tower]=this.model.towers.splice(index,1); this.model.metal+=Math.floor(tower.spent*.7);
    if (this.model.selected===id) this.model.selected=null;
    return {ok:true};
  }
  move(id:number, position:Vec2):ActionResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    const tower=this.model.towers.find(candidate=>candidate.id===id);
    if (!tower) return {ok:false,reason:'Tower not found.'};
    const buildMap=infantryMap(this.map,this.model.infantry??freshInfantry());
    const placement=resolvePlacement(buildMap,position,1.25,this.buildMounts);
    if (placement.x===tower.x && placement.y===tower.y) return {ok:false,reason:'Choose a new tower location.'};
    const otherTowers=this.model.towers.filter(candidate=>candidate.id!==id);
    if (!canPlace(buildMap,otherTowers,placement,1.25,this.buildMounts)) return {ok:false,reason:'That position is blocked or too close to another tower.'};
    if (this.model.metal<TOWER_MOVE_COST) return {ok:false,reason:`Requires ${TOWER_MOVE_COST} Metal.`};
    this.model.metal-=TOWER_MOVE_COST;tower.x=placement.x;tower.y=placement.y;delete tower.groundTarget;
    return {ok:true};
  }
  setGroundTarget(id:number, target:Vec2|null):ActionResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    const tower=this.model.towers.find(candidate=>candidate.id===id);
    if (!tower) return {ok:false,reason:'Tower not found.'};
    if (target===null){delete tower.groundTarget;return {ok:true};}
    if (!Number.isFinite(target.x)||!Number.isFinite(target.y)||target.x<0||target.y<0||target.x>this.map.width||target.y>this.map.height) return {ok:false,reason:'Choose a point inside the battlefield.'};
    const range=compileTower(tower,this.model.bonuses,this.model.commandUpgrades,this.statModifiers()).range;
    if (Math.hypot(target.x-tower.x,target.y-tower.y)>range) return {ok:false,reason:'That ground target is outside this turret’s range.'};
    tower.groundTarget={x:target.x,y:target.y};
    tower.angle=(Math.atan2(target.y-tower.y,target.x-tower.x)+Math.PI*2)%(Math.PI*2);
    return {ok:true};
  }
  upgrade(id:number, branch:number):ActionResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    const tower=this.model.towers.find(t=>t.id===id);
    if (!tower || !isTowerKind(tower.kind)) return {ok:false,reason:'Tower not found.'};
    if (branch!==0 && branch!==1) return {ok:false,reason:'Choose branch 0 or 1.'};
    if (tower.branch>=0 && tower.branch!==branch) return {ok:false,reason:'This tower is committed to its other branch.'};
    if (tower.level>=MAX_TOWER_LEVEL) return {ok:false,reason:'This tower is fully upgraded.'};
    const cost=towerUpgradeCost(tower.level);
    if (this.model.metal<cost) return {ok:false,reason:'Insufficient Metal.'};
    this.model.metal-=cost; tower.spent+=cost; tower.level++; tower.branch=branch;
    return {ok:true};
  }
  /** Cooldowns advance only with combat simulation, never while paused or preparing. */
  advanceCrushers(seconds:number):void {
    if(this.model.phase!=='combat'||!Number.isFinite(seconds)||seconds<=0)return;
    for(const tower of this.model.towers)if(tower.kind==='crusher'){
      tower.cooldown=Math.max(0,tower.cooldown-seconds);
      tower.crusherAnimation=Math.max(0,(tower.crusherAnimation??0)-seconds);
    }
  }
  slamCrushers():Effect[] {
    if(this.model.phase!=='combat')return [];
    const effects:Effect[]=[];
    this.model.towers.forEach((tower,index)=>{
      if(tower.kind!=='crusher'||tower.cooldown>0)return;
      const definition=compileTower(tower,this.model.bonuses,this.model.commandUpgrades,this.statModifiers());
      tower.cooldown=definition.cooldown;tower.crusherRecharge=definition.cooldown;tower.crusherAnimation=.7;
      effects.push({x:tower.x,y:tower.y,kind:'crush',radius:6,strength:definition.force,damage:definition.damage,direction:{x:0,y:1},cone:0,duration:.7,source:index+1,peakPressureKpa:definition.peakPressureKpa});
    });
    return effects;
  }
  startWave():ActionResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'The current wave is not ready to start.'};
    if(this.model.bonusChoices.length)return {ok:false,reason:'Choose a command boon before starting the wave.'};
    this.carriedQuota=this.live+this.model.pending.reduce((sum,batch)=>sum+batch.count,0);
    const wave=waveFor(this.model.level,this.model.wave+1,this.map.id); this.waveStartBaseHealth=this.model.baseHealth;for(const tower of this.model.towers)if(tower.kind==='crusher'){tower.cooldown=0;tower.crusherAnimation=0;}this.model.wave++; this.model.pending=[...this.model.pending,...wave.spawns.map(batch=>({...batch,credit:0}))]; this.model.phase='combat';this.spawnElapsed=0;this.spawnAllocation=0;this.spawnPeakRate=wave.peakRate;
    return {ok:true};
  }
  restartWave():ActionResult {
    if(this.model.wave<1||!['combat','settling','lost'].includes(this.model.phase))return {ok:false,reason:'There is no active wave to restart.'};
    const wave=waveFor(this.model.level,this.model.wave,this.map.id);this.model.pending=wave.spawns.map(batch=>({...batch,credit:0}));this.model.phase='combat';this.model.baseHealth=this.waveStartBaseHealth;this.model.selected=null;
    this.live=0;this.carriedQuota=0;this.spawnElapsed=0;this.spawnAllocation=0;this.spawnPeakRate=wave.peakRate;this.runEpoch++;this.applied=emptyApplied();
    return {ok:true};
  }
  takeSpawns(capacity:number, seconds=0):SpawnBatch[] {
    if (!['combat','preparation','checkpoint'].includes(this.model.phase) || !isFiniteInteger(capacity) || capacity<0) return [];
    const previous=this.spawnElapsed;this.spawnElapsed+=Math.max(0,seconds)*this.spawnMultiplier;
    const accepted:SpawnBatch[]=[];
    const pressure=this.spawnPressure;
    const earned=this.model.pending.map(batch=>{
      const start=batch.start??0,duration=batch.duration;
      let demand=0;
      if(duration===undefined){
        demand=Math.max(0,this.spawnElapsed-Math.max(previous,start))*(batch.rate??1);
      }else{
        const from=Math.max(0,Math.min(duration,previous-start)),to=Math.max(0,Math.min(duration,this.spawnElapsed-start));
        const first=batch.rate??1,last=batch.endRate??first,slope=(last-first)/duration;
        demand=first*(to-from)+slope*(to*to-from*from)/2;
        const tail=Math.max(0,this.spawnElapsed-start-duration)-Math.max(0,previous-start-duration);
        demand+=tail*(first+last)/2;
      }
      // Credit is bounded: a blocked entrance cannot accumulate a catch-up explosion.
      const creditRate=Math.max(batch.rate??1,batch.endRate??batch.rate??1)*pressure;
      batch.credit=seconds===0?batch.count:Math.min((batch.credit??0)+demand*pressure,Math.max(1,creditRate*this.spawnMultiplier*.5));
      return Math.min(batch.count,Math.floor(batch.credit));
    });
    const total=earned.reduce((sum,value)=>sum+value,0), budget=seconds===0?Math.min(capacity,total):Math.min(capacity,total,Math.max(1,Math.ceil(this.spawnPeakRate*this.spawnMultiplier*.5)));
    let allocated=0,cumulative=0;
    const phase=budget>0?(this.spawnAllocation++*.61803398875)%1:0;
    for(let index=0;index<this.model.pending.length;index++){
      const batch=this.model.pending[index];
      // Rotate rounding so even a one-body-wide front retains every species.
      cumulative+=earned[index];
      const target=Math.floor(cumulative*budget/Math.max(1,total)+phase);
      const count=Math.min(earned[index],target-allocated);allocated+=count;if(count<=0)continue;
      accepted.push({...batch,count,credit:undefined});this.live+=count;batch.count-=count;batch.credit=Math.max(0,(batch.credit??0)-count);batch.seed=(batch.seed+count)>>>0;
    }
    this.model.pending=this.model.pending.filter(batch=>batch.count>0);
    return accepted;
  }
  applySettlement(settlement:Settlement):void {
    if (!this.validSettlement(settlement) || settlement.epoch<this.runEpoch || (settlement.epoch===this.runEpoch && settlement.tick<=this.applied.tick)) return;
    if (settlement.epoch>this.runEpoch) { this.runEpoch=settlement.epoch; this.applied=emptyApplied(); }
    if (settlement.kills<this.applied.kills || settlement.crushKills<this.applied.crushKills || settlement.leaks<this.applied.leaks || settlement.earned<this.applied.earned) return;
    const leaks=settlement.leaks-this.applied.leaks, earned=settlement.earned-this.applied.earned;
    const priorTowerKills=this.applied.towerKills;
    this.applied={kills:settlement.kills,crushKills:settlement.crushKills,leaks:settlement.leaks,earned:settlement.earned,tick:settlement.tick,towerKills:priorTowerKills};
    this.model.metal+=earned;
    const salvageRank=researchRank(this.model.commandUpgrades,'salvage-magnets');
    if(salvageRank){
      // Fractional credit keeps stacking salvage ranks independent of readback batch size.
      const credit=(this.model.salvageCredit??0)+earned*salvageRank*0.015;
      this.model.metal+=Math.floor(credit);this.model.salvageCredit=credit%1;
    }
    this.model.baseHealth=Math.max(0,this.model.baseHealth-leaks); this.live=settlement.live;
    const reported=settlement.towerKills??[];
    for(let index=0;index<this.model.towers.length;index++){
      const total=Math.max(0,Math.floor(reported[index]??0)), previous=priorTowerKills[index]??0;
      if(total>previous){
        const tower=this.model.towers[index],kills=total-previous;
        tower.kills=(tower.kills??0)+kills;
        tower.veterancyXp=(tower.veterancyXp??0)+kills;
        tower.veterancy=veterancyLevel(tower.veterancyXp);
      }
    }
    this.applied.towerKills=Array.from({length:MAX_TOWERS},(_,index)=>Math.max(this.applied.towerKills[index]??0,Math.floor(reported[index]??0)));
    if (this.model.baseHealth===0) this.model.phase='lost';
  }
  finishWaveEarly(bossActive=this.isBossWave):ActionResult {
    if(!canFinishWaveEarly(this.waveProgress,this.model.phase,bossActive))return {ok:false,reason:bossActive?'Defeat the boss before advancing.':'Clear at least 95% of the wave before advancing.'};
    return this.completeWave();
  }
  finishSettling():ActionResult {
    if (this.model.phase!=='combat' && this.model.phase!=='settling') return {ok:false,reason:'There is no wave to settle.'};
    if (this.model.pending.length || this.live>0) return {ok:false,reason:'Waiting for live enemies or queued spawns.'};
    return this.completeWave();
  }
  private completeWave():ActionResult {
    const completed=waveFor(this.model.level,this.model.wave,this.map.id); this.model.metal+=completed.payment;
    this.model.bonusChoices=this.model.wave<WAVES_PER_LEVEL&&this.model.wave%3===0?offeredBonuses(this.model.level,this.model.wave,this.model.bonuses):[];
    this.model.phase=this.model.wave>=WAVES_PER_LEVEL?'checkpoint':'preparation';
    return {ok:true};
  }
  continueRun(nextMap?:WorldMap,structureRefund=0):ActionResult {
    if(this.model.phase!=='checkpoint')return {ok:false,reason:'Extraction is not currently available.'};
    const nextLevel=Math.floor(this.model.wave/WAVES_PER_LEVEL)+1;
    if(nextMap&&this.hasRemainingEnemies)return {ok:false,reason:'Clear the remaining enemies before relocating to the next battlefield.'};
    if(nextMap&&(nextLevel===this.model.level||!isFiniteInteger(structureRefund)||structureRefund<0))return {ok:false,reason:'Relocation is only available at the next level boundary.'};
    if(nextMap){
      this.model.metal+=(this.model.infantry?.buildings??[]).reduce((sum,b)=>sum+b.spent,0);this.model.infantry=freshInfantry();
      this.model.metal+=this.model.towers.reduce((sum,tower)=>sum+tower.spent,0)+structureRefund;
      this.model.towers=[];this.model.selected=null;this.nextTowerId=1;this.map=nextMap;this.buildMounts=[];
      this.runEpoch++;this.applied=emptyApplied();this.live=0;
    }
    this.model.level=nextLevel;this.model.phase='preparation';return {ok:true};
  }
  finishRun():ActionResult {if(this.model.phase!=='checkpoint')return {ok:false,reason:'Survive ten waves before extracting.'};this.model.phase='won';return {ok:true};}
  chooseBonus(id:string):ActionResult {
    if (!this.model.bonusChoices.some(choice=>choice.id===id)) return {ok:false,reason:'That bonus is not available.'};
    if (id==='salvage-contract') this.model.metal+=35;
    else if (!this.model.bonuses.includes(id)) this.model.bonuses.push(id);
    this.model.bonusChoices=[];
    return {ok:true};
  }
  buyCommandUpgrade(id:string):ActionResult {
    const availability=commandUpgradeAvailability(this.model,id);
    if(!availability.ok)return availability;
    const upgrade=COMMAND_UPGRADES.find(candidate=>candidate.id===id);
    if (!upgrade) return {ok:false,reason:'Unknown command upgrade.'};
    const rank=researchRank(this.model.commandUpgrades,id);this.model.metal-=researchCost(upgrade,rank);this.model.commandUpgrades.push(id);
    if(id==='fortified-core') this.model.baseHealth=Math.min(100,this.model.baseHealth+1);
    return {ok:true};
  }
  spendMetal(cost:number):ActionResult { if(this.model.phase==='won'||this.model.phase==='lost')return {ok:false,reason:'The run is over.'};if(this.model.metal<cost)return {ok:false,reason:'Insufficient Metal.'};this.model.metal-=cost;return {ok:true}; }
  refundMetal(amount:number):void { this.model.metal+=Math.max(0,Math.floor(amount)); }
  reset(level=1):void { Object.assign(this.model,fresh(),{level,infantry:freshInfantry()}); this.nextTowerId=1; this.runEpoch++; this.applied=emptyApplied(); this.live=0;this.carriedQuota=0;this.waveStartBaseHealth=this.model.baseHealth; }
  clearSave():void { try { if(typeof window!=='undefined')window.localStorage.removeItem(SAVE_KEY); } catch {/* Persistence is optional. */} }
  resetTowerAttribution():void { this.applied.towerKills=Array(MAX_TOWERS).fill(0); }
  setMap(map:WorldMap):void { this.map=map; }
  setBuildMounts(mounts:readonly Rect[]):void { this.buildMounts=mounts.map(mount=>({...mount})); }
  save():string {
    if (!['preparation','checkpoint'].includes(this.model.phase)) throw new Error('Runs can only be saved between waves.');
    const text=this.serialize();
    try { if (typeof window!=='undefined') window.localStorage.setItem(SAVE_KEY,text); }
    catch (error) { throw new Error(`Could not save run: ${error instanceof Error ? error.message : String(error)}`); }
    return text;
  }
  serialize():string {
    if (!['preparation','checkpoint'].includes(this.model.phase)) throw new Error('Runs can only be saved between waves.');
    return JSON.stringify({version:1,contentVersion:CONTENT_VERSION,mapId:this.map.id,model:copy(this.model),epoch:this.runEpoch,applied:this.applied} satisfies SavedRun);
  }
  load(text?:string, context?:{map:WorldMap;buildMounts:readonly Rect[]}):ActionResult {
    try {
      const raw=text ?? (typeof window!=='undefined' ? window.localStorage.getItem(SAVE_KEY) : null);
      if (!raw) return {ok:false,reason:'No saved run found.'};
      const saved=JSON.parse(raw) as unknown;
      // Old saves keep their defense and run progress while gaining the full
      // weapon roster. Account-wide ranks are no longer used.
      if (saved && typeof saved==='object' && 'contentVersion' in saved && (saved.contentVersion==='pressure-front-4'||saved.contentVersion==='pressure-front-5'||saved.contentVersion==='pressure-front-6') && 'model' in saved && saved.model && typeof saved.model==='object' && 'towers' in saved.model && Array.isArray(saved.model.towers)) {
        const legacyModel=saved.model as Partial<RunModel> & {towers:unknown[]};
        legacyModel.unlockedTowers=[...STARTER_TOWERS];
        if(saved.contentVersion==='pressure-front-4')legacyModel.statRanks={};
        saved.contentVersion=CONTENT_VERSION;
      }
      if (!this.validSave(saved,context?.map,context?.buildMounts)) return {ok:false,reason:'Invalid saved run.'};
      const next=copy(saved.model);next.salvageCredit??=0;next.infantry=structuredClone(saved.model.infantry??freshInfantry());
      if(context){this.setMap(context.map);this.setBuildMounts(context.buildMounts);}
      Object.assign(this.model,next); this.nextTowerId=Math.max(0,...next.towers.map(t=>t.id))+1;
      this.runEpoch=Math.max(this.runEpoch+1,saved.epoch+1); this.applied=emptyApplied(); this.live=0;this.carriedQuota=0;this.waveStartBaseHealth=this.model.baseHealth;
      return {ok:true};
    } catch { return {ok:false,reason:'Invalid saved run.'}; }
  }
  private validSettlement(value:Settlement):boolean {
    return isFiniteInteger(value.epoch) && value.epoch>=0 && isFiniteInteger(value.tick) && value.tick>=0 && isFiniteInteger(value.kills) && value.kills>=0 && isFiniteInteger(value.crushKills) && value.crushKills>=0 && isFiniteInteger(value.leaks) && value.leaks>=0 && isFiniteInteger(value.earned) && value.earned>=0 && isFiniteInteger(value.live) && value.live>=0 && isFiniteInteger(value.invalid) && value.invalid>=0 && isNonNegative(value.maxPacking);
  }
  private validSave(value:unknown,map=this.map,mounts:readonly Rect[]=this.buildMounts):value is SavedRun {
    if (!value || typeof value!=='object') return false;
    const saved=value as SavedRun, model=saved.model;
    if (saved.version!==1 || saved.contentVersion!==CONTENT_VERSION || (saved.mapId!==map.id && !(saved.mapId===undefined && map.id===DEFAULT_MAP.id)) || !isFiniteInteger(saved.epoch) || saved.epoch<0 || !validApplied(saved.applied) || !model || typeof model!=='object' || !['preparation','checkpoint'].includes(model.phase) || !isFiniteInteger(model.metal) || model.metal<0 || !isFiniteInteger(model.baseHealth) || model.baseHealth<0 || model.baseHealth>100 || !isFiniteInteger(model.level) || model.level<1 || !isFiniteInteger(model.wave) || model.wave<0 || model.waveCount!==WAVES_PER_LEVEL || !Array.isArray(model.towers) || model.towers.length>MAX_TOWERS || !Array.isArray(model.pending) || model.pending.length!==0 || !Array.isArray(model.bonuses) || !Array.isArray(model.commandUpgrades) || !Array.isArray(model.bonusChoices) || model.bonusChoices.some(choice=>!BONUSES.some(known=>choice.id===known.id))) return false;
    if(model.salvageCredit!==undefined&&(!Number.isFinite(model.salvageCredit)||model.salvageCredit<0||model.salvageCredit>=1))return false;
    if (!Array.isArray(model.unlockedTowers) || !STARTER_TOWERS.every(kind=>model.unlockedTowers.includes(kind)) || model.unlockedTowers.some((kind,index)=>!isTowerKind(kind)||model.unlockedTowers.indexOf(kind)!==index)) return false;
    if (!model.statRanks || typeof model.statRanks!=='object' || Array.isArray(model.statRanks) || Object.entries(model.statRanks).some(([id,rank])=>{
      return !isFiniteInteger(rank) || rank!==0;
    })) return false;
    const towers:Tower[]=[];
    if(model.infantry!==undefined&&!validInfantry(model.infantry,mapWithTurretObstacles(map,model.towers)))return false;
    for (const tower of model.towers) { if (!validTower(map,tower,towers,mounts) || !model.unlockedTowers.includes(tower.kind)) return false; towers.push(tower); }
    if (model.selected!==null && (!isFiniteInteger(model.selected) || !towers.some(tower=>tower.id===model.selected))) return false;
    return model.bonuses.every((bonus,index)=>typeof bonus==='string' && BONUSES.some(known=>known.id===bonus) && model.bonuses.indexOf(bonus)===index) && model.commandUpgrades.every(upgrade=>typeof upgrade==='string' && COMMAND_UPGRADES.some(known=>known.id===upgrade)) && COMMAND_UPGRADES.every(upgrade=>researchRank(model.commandUpgrades,upgrade.id)<=(upgrade.maxRank??1));
  }
}
export const createRun=(initialMap:WorldMap=DEFAULT_MAP):RunController=>new RunController(initialMap);
