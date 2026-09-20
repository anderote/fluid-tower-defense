import {COMMAND_UPGRADES, DEFAULT_MAP, TOWERS, veterancyLevel} from '../content/index.ts';
import {canPlace} from '../navigation/index.ts';
import type {BonusChoice, RunModel, Settlement, SpawnBatch, Tower, TowerKind, Vec2, WorldMap} from '../contracts/index.ts';

export type ActionResult = {ok:true} | {ok:false; reason:string};
export type PlaceResult = ActionResult & {tower?:Tower};
type Wave = {spawns:readonly SpawnBatch[]; payment:number; bonus:boolean; peakRate:number; rampSeconds:number; boss:boolean};
type Applied = Pick<Settlement,'kills'|'crushKills'|'leaks'|'earned'> & {tick:number;towerKills:number[]};
type SavedRun = {version:1; contentVersion:string; mapId?:string; model:RunModel; epoch:number; applied:Applied};

export const CONTENT_VERSION = 'pressure-front-3';
const SAVE_KEY = 'pressure-front.run.v1';
const MAX_TOWERS = 64;
export const WAVES_PER_LEVEL=10;
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
const copy = (model:RunModel):RunModel => ({...model,towers:model.towers.map(t=>({...t})),pending:model.pending.map(b=>({...b})),bonusChoices:model.bonusChoices.map(b=>({...b})),bonuses:[...model.bonuses],commandUpgrades:[...model.commandUpgrades]});
const fresh = ():RunModel => ({phase:'preparation',metal:650,baseHealth:20,level:1,wave:0,waveCount:WAVES_PER_LEVEL,towers:[],selected:null,pending:[],bonusChoices:[],bonuses:[],commandUpgrades:[]});

/** Deterministic procedural compositions: each level introduces denser, faster mixed pressure. */
export function waveFor(level:number,wave:number):Wave {
  const levelIndex=Math.max(0,level-1), waveIndex=Math.max(0,wave-1), threat=levelIndex*WAVES_PER_LEVEL+waveIndex;
  const total=Math.min(62_000,Math.round(1_500+threat*550+Math.pow(threat,1.42)*130));
  const runnerWeight=waveIndex<1?0:Math.min(.38,.08+threat*.012);
  const bruteWeight=waveIndex<3?0:Math.min(.28,.035+Math.max(0,threat-3)*.009);
  const shamblerWeight=Math.max(.24,1-runnerWeight-bruteWeight);
  const seed=(level*10_000+wave*977)>>>0;
  const shamblers=Math.round(total*shamblerWeight), runners=Math.round(total*runnerWeight), brutes=Math.max(0,total-shamblers-runners);
  const spawns:SpawnBatch[]=[];
  if(shamblers)spawns.push({kind:'shambler',count:shamblers,seed});
  if(runners)spawns.push({kind:'runner',count:runners,seed:seed+1});
  if(brutes)spawns.push({kind:'brute',count:brutes,seed:seed+2});
  return {spawns,payment:Math.round(210+threat*82+Math.pow(threat,1.28)*12),bonus:wave%2===0||wave===WAVES_PER_LEVEL,peakRate:Math.min(1_200,170+threat*38),rampSeconds:Math.min(30,8+waveIndex*1.6+levelIndex),boss:wave===WAVES_PER_LEVEL};
}
const offeredBonuses=(level:number,wave:number,owned:readonly string[]):BonusChoice[]=>{
  const available=BONUSES.filter(choice=>choice.id==='salvage-contract'||!owned.includes(choice.id));
  const offset=(level*7+wave*3)%available.length;
  return Array.from({length:Math.min(3,available.length)},(_,index)=>available[(offset+index)%available.length]);
};
const spentAtLevel = (kind:TowerKind, level:number):number => {
  let spent=TOWERS[kind].cost;
  for (let upgrade=0;upgrade<level;upgrade++) spent+=45+upgrade*35;
  return spent;
};

function validTower(map:WorldMap, tower:unknown, prior:readonly Tower[]): tower is Tower {
  if (!tower || typeof tower !== 'object') return false;
  const value=tower as Tower;
  if (!isFiniteInteger(value.id) || value.id<=0 || !isTowerKind(value.kind) || !isNonNegative(value.x) || !isNonNegative(value.y) || !isFiniteInteger(value.level) || value.level<0 || value.level>3 || !isFiniteInteger(value.branch) || ![-1,0,1].includes(value.branch) || (value.level===0 && value.branch!==-1) || (value.level>0 && value.branch===-1) || !isNonNegative(value.angle) || !isNonNegative(value.cooldown) || !isFiniteInteger(value.spent) || value.spent!==spentAtLevel(value.kind,value.level) || prior.some(other=>other.id===value.id)) return false;
  return canPlace(map,prior,value,1.25);
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
  private spawnElapsed=0;
  private spawnCredit=0;
  private spawnMultiplier=1;
  private map:WorldMap;

  constructor(initialMap:WorldMap=DEFAULT_MAP) { this.map=initialMap; }

  get epoch():number { return this.runEpoch; }
  get isBossWave():boolean { return this.model.wave===this.model.waveCount; }
  setSpawnMultiplier(value:number):number { this.spawnMultiplier=Math.max(1,Math.min(40,Math.round(value)||1)); return this.spawnMultiplier; }

  place(kind:TowerKind, position:Vec2):PlaceResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    if (!isTowerKind(kind)) return {ok:false,reason:'Unknown tower.'};
    if (this.model.towers.length>=MAX_TOWERS) return {ok:false,reason:'The tower limit has been reached.'};
    const def=TOWERS[kind];
    if (this.model.metal<def.cost) return {ok:false,reason:'Insufficient Metal.'};
    if (!canPlace(this.map,this.model.towers,position,1.25)) return {ok:false,reason:'That position is blocked or too close to another tower.'};
    const tower:Tower={id:this.nextTowerId++,kind,x:position.x,y:position.y,level:0,branch:-1,angle:0,cooldown:0,spent:def.cost,kills:0,veterancy:0,veterancyXp:0};
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
  upgrade(id:number, branch:number):ActionResult {
    if (this.model.phase==='won' || this.model.phase==='lost') return {ok:false,reason:'The run is over.'};
    const tower=this.model.towers.find(t=>t.id===id);
    if (!tower || !isTowerKind(tower.kind)) return {ok:false,reason:'Tower not found.'};
    if (branch!==0 && branch!==1) return {ok:false,reason:'Choose branch 0 or 1.'};
    if (tower.branch>=0 && tower.branch!==branch) return {ok:false,reason:'This tower is committed to its other branch.'};
    if (tower.level>=3) return {ok:false,reason:'This tower is fully upgraded.'};
    const cost=45+tower.level*35;
    if (this.model.metal<cost) return {ok:false,reason:'Insufficient Metal.'};
    this.model.metal-=cost; tower.spent+=cost; tower.level++; tower.branch=branch;
    return {ok:true};
  }
  startWave():ActionResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'The current wave is not ready to start.'};
    if (this.model.bonusChoices.length) return {ok:false,reason:'Choose a command boon before starting the next wave.'};
    const wave=waveFor(this.model.level,this.model.wave+1); this.model.wave++; this.model.pending=wave.spawns.map(batch=>({...batch})); this.model.phase='combat'; this.live=0;this.spawnElapsed=0;this.spawnCredit=0;
    return {ok:true};
  }
  takeSpawns(capacity:number, seconds=0):SpawnBatch[] {
    if (this.model.phase!=='combat' || !isFiniteInteger(capacity) || capacity<=0) return [];
    const wave=waveFor(this.model.level,this.model.wave);this.spawnElapsed+=Math.max(0,seconds);const ramp=Math.min(1,this.spawnElapsed/wave.rampSeconds);this.spawnCredit+=wave.peakRate*this.spawnMultiplier*(.2+.8*ramp)*Math.max(0,seconds);
    let available=seconds===0?capacity:Math.min(capacity,Math.floor(this.spawnCredit)); const accepted:SpawnBatch[]=[];
    while (available>0 && this.model.pending.length) {
      const batch=this.model.pending[0], count=Math.min(batch.count,available);
      accepted.push({...batch,count}); available-=count; this.live+=count;
      if (count===batch.count) this.model.pending.shift(); else { batch.count-=count; batch.seed=(batch.seed+count)>>>0; }
    }
    this.spawnCredit-=accepted.reduce((sum,batch)=>sum+batch.count,0);
    return accepted;
  }
  applySettlement(settlement:Settlement):void {
    if (!this.validSettlement(settlement) || settlement.epoch<this.runEpoch || (settlement.epoch===this.runEpoch && settlement.tick<=this.applied.tick)) return;
    if (settlement.epoch>this.runEpoch) { this.runEpoch=settlement.epoch; this.applied=emptyApplied(); }
    if (settlement.kills<this.applied.kills || settlement.crushKills<this.applied.crushKills || settlement.leaks<this.applied.leaks || settlement.earned<this.applied.earned) return;
    const kills=settlement.kills-this.applied.kills, leaks=settlement.leaks-this.applied.leaks, earned=settlement.earned-this.applied.earned;
    const priorTowerKills=this.applied.towerKills;
    this.applied={kills:settlement.kills,crushKills:settlement.crushKills,leaks:settlement.leaks,earned:settlement.earned,tick:settlement.tick,towerKills:priorTowerKills};
    this.model.metal+=Math.floor(earned*(this.model.commandUpgrades.includes('salvage-magnets')?1.25:1)); this.model.baseHealth=Math.max(0,this.model.baseHealth-leaks); this.live=settlement.live;
    const reported=settlement.towerKills??[];
    for(let index=0;index<this.model.towers.length;index++){
      const total=Math.max(0,Math.floor(reported[index]??0)), previous=priorTowerKills[index]??0;
      if(total>=previous)this.model.towers[index].kills=(this.model.towers[index].kills??0)+(total-previous);
    }
    this.applied.towerKills=Array.from({length:MAX_TOWERS},(_,index)=>Math.max(this.applied.towerKills[index]??0,Math.floor(reported[index]??0)));
    if (this.model.baseHealth===0) this.model.phase='lost';
  }
  finishSettling():ActionResult {
    if (this.model.phase!=='combat' && this.model.phase!=='settling') return {ok:false,reason:'There is no wave to settle.'};
    if (this.model.pending.length || this.live>0) return {ok:false,reason:'Waiting for live enemies or queued spawns.'};
    const completed=waveFor(this.model.level,this.model.wave); this.model.metal+=completed.payment;
    if (this.model.wave===this.model.waveCount) { this.model.level++; this.model.wave=0; }
    this.model.phase='preparation'; this.model.bonusChoices=completed.bonus?offeredBonuses(this.model.level,this.model.wave||WAVES_PER_LEVEL,this.model.bonuses):[];
    return {ok:true};
  }
  chooseBonus(id:string):ActionResult {
    if (!this.model.bonusChoices.some(choice=>choice.id===id)) return {ok:false,reason:'That bonus is not available.'};
    if (id==='salvage-contract') this.model.metal+=35;
    else if (!this.model.bonuses.includes(id)) this.model.bonuses.push(id);
    this.model.bonusChoices=[];
    return {ok:true};
  }
  buyCommandUpgrade(id:string):ActionResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'Command upgrades are only available between waves.'};
    const upgrade=COMMAND_UPGRADES.find(candidate=>candidate.id===id);
    if (!upgrade) return {ok:false,reason:'Unknown command upgrade.'};
    const impactMatch=/^repulsor-impact-(\d+)$/.exec(id);
    if(impactMatch){const level=Number(impactMatch[1]);if(level>1&&!this.model.commandUpgrades.includes(`repulsor-impact-${level-1}`))return {ok:false,reason:'Research earlier Impact Coil levels first.'};}
    const infrastructureMatch=/^(barbed-wire|wall-engineering)-(\d+)$/.exec(id);
    if(infrastructureMatch){const [,prefix,rank]=infrastructureMatch,level=Number(rank);if(level>1&&!this.model.commandUpgrades.includes(`${prefix}-${level-1}`))return {ok:false,reason:`Research ${prefix==='barbed-wire'?'earlier Barbed Wire':'earlier Wall Engineering'} levels first.`};}
    if (this.model.commandUpgrades.includes(id)) return {ok:false,reason:'That command upgrade is already installed.'};
    if (this.model.metal<upgrade.cost) return {ok:false,reason:'Insufficient Metal.'};
    this.model.metal-=upgrade.cost;this.model.commandUpgrades.push(id);
    if(id==='bulkhead-plating') this.model.baseHealth=Math.min(30,this.model.baseHealth+5);
    return {ok:true};
  }
  spendMetal(cost:number):ActionResult { if(this.model.phase==='won'||this.model.phase==='lost')return {ok:false,reason:'The run is over.'};if(this.model.metal<cost)return {ok:false,reason:'Insufficient Metal.'};this.model.metal-=cost;return {ok:true}; }
  refundMetal(amount:number):void { this.model.metal+=Math.max(0,Math.floor(amount)); }
  accrueVeterancy(seconds:number):void {
    if(this.model.phase!=='combat'||!Number.isFinite(seconds)||seconds<=0)return;
    for(const tower of this.model.towers){tower.veterancyXp=(tower.veterancyXp??0)+seconds*1.8;tower.veterancy=veterancyLevel(tower.veterancyXp);}
  }
  reset():void { Object.assign(this.model,fresh()); this.nextTowerId=1; this.runEpoch++; this.applied=emptyApplied(); this.live=0; }
  resetTowerAttribution():void { this.applied.towerKills=Array(MAX_TOWERS).fill(0); }
  setMap(map:WorldMap):void { this.map=map; }
  save():string {
    if (this.model.phase!=='preparation') throw new Error('Runs can only be saved between waves.');
    const text=JSON.stringify({version:1,contentVersion:CONTENT_VERSION,mapId:this.map.id,model:copy(this.model),epoch:this.runEpoch,applied:this.applied} satisfies SavedRun);
    try { if (typeof window!=='undefined') window.localStorage.setItem(SAVE_KEY,text); }
    catch (error) { throw new Error(`Could not save run: ${error instanceof Error ? error.message : String(error)}`); }
    return text;
  }
  load(text?:string):ActionResult {
    try {
      const raw=text ?? (typeof window!=='undefined' ? window.localStorage.getItem(SAVE_KEY) : null);
      if (!raw) return {ok:false,reason:'No saved run found.'};
      const saved=JSON.parse(raw) as unknown;
      if (!this.validSave(saved)) return {ok:false,reason:'Invalid saved run.'};
      const next=copy(saved.model);
      Object.assign(this.model,next); this.nextTowerId=Math.max(0,...next.towers.map(t=>t.id))+1;
      this.runEpoch=Math.max(this.runEpoch+1,saved.epoch+1); this.applied=emptyApplied(); this.live=0;
      return {ok:true};
    } catch { return {ok:false,reason:'Invalid saved run.'}; }
  }
  private validSettlement(value:Settlement):boolean {
    return isFiniteInteger(value.epoch) && value.epoch>=0 && isFiniteInteger(value.tick) && value.tick>=0 && isFiniteInteger(value.kills) && value.kills>=0 && isFiniteInteger(value.crushKills) && value.crushKills>=0 && isFiniteInteger(value.leaks) && value.leaks>=0 && isFiniteInteger(value.earned) && value.earned>=0 && isFiniteInteger(value.live) && value.live>=0 && isFiniteInteger(value.invalid) && value.invalid>=0 && isNonNegative(value.maxPacking);
  }
  private validSave(value:unknown):value is SavedRun {
    if (!value || typeof value!=='object') return false;
    const saved=value as SavedRun, model=saved.model;
    if (saved.version!==1 || saved.contentVersion!==CONTENT_VERSION || (saved.mapId!==this.map.id && !(saved.mapId===undefined && this.map.id===DEFAULT_MAP.id)) || !isFiniteInteger(saved.epoch) || saved.epoch<0 || !validApplied(saved.applied) || !model || typeof model!=='object' || model.phase!=='preparation' || !isFiniteInteger(model.metal) || model.metal<0 || !isFiniteInteger(model.baseHealth) || model.baseHealth<0 || model.baseHealth>30 || !isFiniteInteger(model.level) || model.level<1 || !isFiniteInteger(model.wave) || model.wave<0 || model.wave>=WAVES_PER_LEVEL || model.waveCount!==WAVES_PER_LEVEL || !Array.isArray(model.towers) || model.towers.length>MAX_TOWERS || !Array.isArray(model.pending) || model.pending.length!==0 || !Array.isArray(model.bonuses) || !Array.isArray(model.commandUpgrades) || !Array.isArray(model.bonusChoices) || model.bonusChoices.some(choice=>!BONUSES.some(known=>choice.id===known.id))) return false;
    const towers:Tower[]=[];
    for (const tower of model.towers) { if (!validTower(this.map,tower,towers)) return false; towers.push(tower); }
    if (model.selected!==null && (!isFiniteInteger(model.selected) || !towers.some(tower=>tower.id===model.selected))) return false;
    return model.bonuses.every((bonus,index)=>typeof bonus==='string' && BONUSES.some(known=>known.id===bonus) && model.bonuses.indexOf(bonus)===index) && model.commandUpgrades.every((upgrade,index)=>typeof upgrade==='string' && COMMAND_UPGRADES.some(known=>known.id===upgrade) && model.commandUpgrades.indexOf(upgrade)===index);
  }
}
export const createRun=(initialMap:WorldMap=DEFAULT_MAP):RunController=>new RunController(initialMap);
