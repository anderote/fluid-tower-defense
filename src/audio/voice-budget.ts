export type AudioVoiceGroup='light'|'sustained'|'heavy'|'impact'|'detail';

const GROUP_LIMITS:Record<AudioVoiceGroup,{cooldown:number;voices:number}>={
  light:{cooldown:.05,voices:3},
  sustained:{cooldown:.09,voices:2},
  heavy:{cooldown:.04,voices:4},
  impact:{cooldown:.05,voices:4},
  detail:{cooldown:.065,voices:2},
};

type Voice={group:AudioVoiceGroup;until:number};

/**
 * Keeps dense combat readable by admitting representative sounds instead of
 * letting every simultaneous simulation event become another audio voice.
 */
export class AudioVoiceBudget{
  private readonly active:Voice[]=[];
  private readonly lastPlayed=new Map<AudioVoiceGroup,number>();

  admit(group:AudioVoiceGroup,now:number,duration:number){
    for(let index=this.active.length-1;index>=0;index--)if(this.active[index].until<=now)this.active.splice(index,1);
    const limits=GROUP_LIMITS[group],last=this.lastPlayed.get(group)??-Infinity;
    if(now-last<limits.cooldown)return false;
    const inGroup=this.active.reduce((count,voice)=>count+(voice.group===group?1:0),0);
    if(inGroup>=limits.voices)return false;
    const priority=group==='heavy'||group==='impact';
    if(this.active.length>=(priority?10:6))return false;
    this.lastPlayed.set(group,now);
    this.active.push({group,until:now+duration});
    return true;
  }
}
