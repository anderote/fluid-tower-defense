import {DEFAULT_MAP, TOWERS} from '../content/index.ts';
import {canPlace} from '../navigation/index.ts';
import type {BonusChoice, RunModel, Settlement, SpawnBatch, Tower, TowerKind, Vec2, WorldMap} from '../contracts/index.ts';

export type ActionResult = {ok:true} | {ok:false; reason:string};
export type PlaceResult = ActionResult & {tower?:Tower};
type Wave = {spawns:readonly SpawnBatch[]; payment:number; bonus:boolean};
type Applied = Pick<Settlement,'kills'|'crushKills'|'leaks'|'earned'> & {tick:number};
type SavedRun = {version:1; contentVersion:string; mapId?:string; model:RunModel; epoch:number; applied:Applied};

export const CONTENT_VERSION = 'pressure-front-1';
const SAVE_KEY = 'pressure-front.run.v1';
const MAX_TOWERS = 64;
const WAVES: readonly Wave[] = [
  {spawns:[{kind:'shambler',count:900,seed:101}],payment:180,bonus:false},
  {spawns:[{kind:'runner',count:850,seed:201},{kind:'shambler',count:1_650,seed:202}],payment:300,bonus:true},
  {spawns:[{kind:'brute',count:240,seed:301},{kind:'shambler',count:3_760,seed:302}],payment:480,bonus:false},
  {spawns:[{kind:'runner',count:3_300,seed:401},{kind:'brute',count:650,seed:402},{kind:'shambler',count:4_050,seed:403}],payment:750,bonus:true},
  {spawns:[{kind:'shambler',count:7_000,seed:501},{kind:'runner',count:3_500,seed:502},{kind:'brute',count:1_100,seed:503}],payment:1_150,bonus:false},
];
const BONUSES: readonly BonusChoice[] = [
  {id:'hydraulic-advantage',name:'Hydraulic Advantage',description:'Repulsors push harder but pulse a little slower.'},
  {id:'cold-field',name:'Cold Field',description:'Cryo emitters cover a wider field.'},
  {id:'salvage-contract',name:'Salvage Contract',description:'Gain 35 scrap now.'},
];
const emptyApplied = ():Applied => ({kills:0,crushKills:0,leaks:0,earned:0,tick:-1});
const isFiniteInteger = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
const isNonNegative = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isTowerKind = (value:unknown):value is TowerKind => typeof value === 'string' && Object.hasOwn(TOWERS,value);
const copy = (model:RunModel):RunModel => ({...model,towers:model.towers.map(t=>({...t})),pending:model.pending.map(b=>({...b})),bonusChoices:model.bonusChoices.map(b=>({...b})),bonuses:[...model.bonuses]});
const fresh = ():RunModel => ({phase:'preparation',scrap:450,baseHealth:20,wave:0,waveCount:WAVES.length,towers:[],selected:null,pending:[],bonusChoices:[],bonuses:[]});
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
  return isFiniteInteger(applied.tick) && applied.tick>=-1 && isFiniteInteger(applied.kills) && applied.kills>=0 && isFiniteInteger(applied.crushKills) && applied.crushKills>=0 && isFiniteInteger(applied.leaks) && applied.leaks>=0 && isFiniteInteger(applied.earned) && applied.earned>=0;
}

export class RunController {
  readonly model:RunModel = fresh();
  private nextTowerId=1;
  private runEpoch=1;
  private applied=emptyApplied();
  private live=0;
  private map:WorldMap;

  constructor(initialMap:WorldMap=DEFAULT_MAP) { this.map=initialMap; }

  get epoch():number { return this.runEpoch; }
  get isBossWave():boolean { return this.model.wave===this.model.waveCount; }

  place(kind:TowerKind, position:Vec2):PlaceResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'Towers can only be placed during preparation.'};
    if (!isTowerKind(kind)) return {ok:false,reason:'Unknown tower.'};
    if (this.model.towers.length>=MAX_TOWERS) return {ok:false,reason:'The tower limit has been reached.'};
    const def=TOWERS[kind];
    if (this.model.scrap<def.cost) return {ok:false,reason:'Insufficient scrap.'};
    if (!canPlace(this.map,this.model.towers,position,1.25)) return {ok:false,reason:'That position is blocked or too close to another tower.'};
    const tower:Tower={id:this.nextTowerId++,kind,x:position.x,y:position.y,level:0,branch:-1,angle:0,cooldown:0,spent:def.cost};
    this.model.scrap-=def.cost; this.model.towers.push(tower); this.model.selected=tower.id;
    return {ok:true,tower};
  }
  sell(id:number):ActionResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'Towers can only be sold during preparation.'};
    const index=this.model.towers.findIndex(t=>t.id===id);
    if (index<0) return {ok:false,reason:'Tower not found.'};
    const [tower]=this.model.towers.splice(index,1); this.model.scrap+=Math.floor(tower.spent*.7);
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
    if (this.model.scrap<cost) return {ok:false,reason:'Insufficient scrap.'};
    this.model.scrap-=cost; tower.spent+=cost; tower.level++; tower.branch=branch;
    return {ok:true};
  }
  startWave():ActionResult {
    if (this.model.phase!=='preparation') return {ok:false,reason:'The current wave is not ready to start.'};
    if (this.model.bonusChoices.length) return {ok:false,reason:'Choose a run bonus first.'};
    if (this.model.wave>=WAVES.length) return {ok:false,reason:'All waves are complete.'};
    const wave=WAVES[this.model.wave++]; this.model.pending=wave.spawns.map(batch=>({...batch})); this.model.phase='combat'; this.live=0;
    return {ok:true};
  }
  takeSpawns(capacity:number):SpawnBatch[] {
    if (this.model.phase!=='combat' || !isFiniteInteger(capacity) || capacity<=0) return [];
    let available=capacity; const accepted:SpawnBatch[]=[];
    while (available>0 && this.model.pending.length) {
      const batch=this.model.pending[0], count=Math.min(batch.count,available);
      accepted.push({...batch,count}); available-=count; this.live+=count;
      if (count===batch.count) this.model.pending.shift(); else { batch.count-=count; batch.seed=(batch.seed+count)>>>0; }
    }
    return accepted;
  }
  applySettlement(settlement:Settlement):void {
    if (!this.validSettlement(settlement) || settlement.epoch<this.runEpoch || (settlement.epoch===this.runEpoch && settlement.tick<=this.applied.tick)) return;
    if (settlement.epoch>this.runEpoch) { this.runEpoch=settlement.epoch; this.applied=emptyApplied(); }
    if (settlement.kills<this.applied.kills || settlement.crushKills<this.applied.crushKills || settlement.leaks<this.applied.leaks || settlement.earned<this.applied.earned) return;
    const leaks=settlement.leaks-this.applied.leaks, earned=settlement.earned-this.applied.earned;
    this.applied={kills:settlement.kills,crushKills:settlement.crushKills,leaks:settlement.leaks,earned:settlement.earned,tick:settlement.tick};
    this.model.scrap+=earned; this.model.baseHealth=Math.max(0,this.model.baseHealth-leaks); this.live=settlement.live;
    if (this.model.baseHealth===0) this.model.phase='lost';
  }
  finishSettling():ActionResult {
    if (this.model.phase!=='combat' && this.model.phase!=='settling') return {ok:false,reason:'There is no wave to settle.'};
    if (this.model.pending.length || this.live>0) return {ok:false,reason:'Waiting for live enemies or queued spawns.'};
    const completed=WAVES[this.model.wave-1]; this.model.scrap+=completed.payment;
    if (this.model.wave===this.model.waveCount) { this.model.phase='won'; return {ok:true}; }
    this.model.phase='preparation'; this.model.bonusChoices=completed.bonus ? this.eligibleBonuses() : [];
    return {ok:true};
  }
  chooseBonus(id:string):ActionResult {
    if (!this.model.bonusChoices.some(choice=>choice.id===id)) return {ok:false,reason:'That bonus is not available.'};
    if (id==='salvage-contract') this.model.scrap+=35;
    else if (!this.model.bonuses.includes(id)) this.model.bonuses.push(id);
    this.model.bonusChoices=[];
    return {ok:true};
  }
  reset():void { Object.assign(this.model,fresh()); this.nextTowerId=1; this.runEpoch++; this.applied=emptyApplied(); this.live=0; }
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
  private eligibleBonuses():BonusChoice[] {
    const owns=(kind:TowerKind)=>this.model.towers.some(tower=>tower.kind===kind);
    const useful=BONUSES.filter(bonus=>!this.model.bonuses.includes(bonus.id) && ((bonus.id==='hydraulic-advantage' && owns('repulsor')) || (bonus.id==='cold-field' && owns('cryo'))));
    const salvage=BONUSES.find(bonus=>bonus.id==='salvage-contract')!;
    return [...useful.slice(0,1),salvage].map(bonus=>({...bonus}));
  }
  private validSave(value:unknown):value is SavedRun {
    if (!value || typeof value!=='object') return false;
    const saved=value as SavedRun, model=saved.model;
    if (saved.version!==1 || saved.contentVersion!==CONTENT_VERSION || (saved.mapId!==this.map.id && !(saved.mapId===undefined && this.map.id===DEFAULT_MAP.id)) || !isFiniteInteger(saved.epoch) || saved.epoch<0 || !validApplied(saved.applied) || !model || typeof model!=='object' || model.phase!=='preparation' || !isFiniteInteger(model.scrap) || model.scrap<0 || !isFiniteInteger(model.baseHealth) || model.baseHealth<0 || model.baseHealth>20 || !isFiniteInteger(model.wave) || model.wave<0 || model.wave>=WAVES.length || model.waveCount!==WAVES.length || !Array.isArray(model.towers) || model.towers.length>MAX_TOWERS || !Array.isArray(model.pending) || model.pending.length!==0 || !Array.isArray(model.bonuses) || !Array.isArray(model.bonusChoices) || model.bonusChoices.some(choice=>!BONUSES.some(known=>known.id===choice.id))) return false;
    const towers:Tower[]=[];
    for (const tower of model.towers) { if (!validTower(this.map,tower,towers)) return false; towers.push(tower); }
    if (model.selected!==null && (!isFiniteInteger(model.selected) || !towers.some(tower=>tower.id===model.selected))) return false;
    return model.bonuses.every((bonus,index)=>typeof bonus==='string' && BONUSES.some(known=>known.id===bonus) && model.bonuses.indexOf(bonus)===index);
  }
}
export const createRun=(initialMap:WorldMap=DEFAULT_MAP):RunController=>new RunController(initialMap);
