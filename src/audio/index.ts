import type {TowerKind} from '../contracts/index.ts';

/**
 * Dry, layered weapon feedback inspired by OpenSoldat's per-weapon fire and
 * casing sounds. Everything is synthesized so the game ships no copied audio.
 */
export function createAudio(){
  let ctx:AudioContext|undefined,master:GainNode|undefined,noise:AudioBuffer|undefined;

  const arm=()=>{
    if(!ctx){
      ctx=new AudioContext();
      master=ctx.createGain();master.gain.value=.48;
      const limiter=ctx.createDynamicsCompressor();
      limiter.threshold.value=-16;limiter.knee.value=8;limiter.ratio.value=10;limiter.attack.value=.002;limiter.release.value=.12;
      master.connect(limiter).connect(ctx.destination);
      noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
      const channel=noise.getChannelData(0);let seed=0x51f15e;
      for(let i=0;i<channel.length;i++){seed=(seed*1664525+1013904223)>>>0;channel[i]=(seed/0xffffffff)*2-1;}
    }
    if(ctx.state==='suspended')void ctx.resume();
  };
  const stereo=(x:number)=>Math.max(-.72,Math.min(.72,(x/160)*1.44-.72));
  const output=(node:AudioNode,pan:number)=>{if(!ctx||!master)return;const p=ctx.createStereoPanner();p.pan.value=pan;node.connect(p).connect(master);};
  const tone=(at:number,startHz:number,endHz:number,duration:number,gain:number,pan:number,type:OscillatorType='triangle')=>{
    if(!ctx)return;const oscillator=ctx.createOscillator(),envelope=ctx.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(startHz,at);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endHz),at+duration);envelope.gain.setValueAtTime(Math.max(.0001,gain),at);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);oscillator.connect(envelope);output(envelope,pan);oscillator.start(at);oscillator.stop(at+duration+.01);
  };
  const hiss=(at:number,duration:number,gain:number,highpass:number,lowpass:number,pan:number,offset=0)=>{
    if(!ctx||!noise)return;const source=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),envelope=ctx.createGain();source.buffer=noise;hp.type='highpass';hp.frequency.value=highpass;lp.type='lowpass';lp.frequency.value=lowpass;envelope.gain.setValueAtTime(Math.max(.0001,gain),at);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);source.connect(hp).connect(lp).connect(envelope);output(envelope,pan);source.start(at,Math.abs(offset)%Math.max(.01,noise.duration-duration));source.stop(at+duration+.01);
  };
  const fire=(kind:TowerKind,x:number,serial=0)=>{
    if(!ctx||!master)return;const at=ctx.currentTime+.008,pan=stereo(x),jitter=((serial*37)%17-8)/100;
    switch(kind){
      case 'autocannon':
        hiss(at,.055,.23,720,7600,pan,serial*.071);tone(at,132*(1+jitter),58,.075,.16,pan,'sawtooth');tone(at+.008,980*(1+jitter),410,.035,.035,pan,'square');break;
      case 'railgun':
        hiss(at,.09,.2,1100,11000,pan,serial*.113);tone(at,92,42,.14,.2,pan,'sawtooth');tone(at,2100*(1+jitter),620,.12,.065,pan,'square');break;
      case 'mortar':
        hiss(at,.12,.17,80,2100,pan,serial*.191);tone(at,78,31,.2,.24,pan,'sine');break;
      case 'rocket':
        hiss(at,.24,.16,90,3200,pan,serial*.137);tone(at,68,34,.18,.19,pan,'sawtooth');break;
      case 'tesla':
        hiss(at,.1,.11,2200,12000,pan,serial*.097);tone(at,1450*(1+jitter),190,.16,.08,pan,'sawtooth');break;
      case 'incinerator':
        hiss(at,.2,.1,180,4400,pan,serial*.157);tone(at,96,49,.13,.07,pan,'sawtooth');break;
      case 'cryo':
        hiss(at,.16,.085,650,5200,pan,serial*.173);tone(at,420,170,.14,.035,pan,'sine');break;
      case 'repulsor':
        tone(at,116,43,.2,.16,pan,'sine');tone(at,510,120,.12,.045,pan,'triangle');break;
    }
  };
  const shell=(x:number,serial=0,heavy=false)=>{
    if(!ctx)return;const at=ctx.currentTime+(heavy ? .31 : .22)+((serial*17)%9)*.012,pan=stereo(x),pitch=(heavy?940:1450)*(1+((serial*29)%13-6)/90);
    tone(at,pitch,pitch*.72,.035,heavy ? .055 : .035,pan,'triangle');
    hiss(at,.025,heavy ? .045 : .026,1800,8200,pan,serial*.211);
    if(heavy)tone(at+.075,pitch*.54,pitch*.42,.028,.022,pan,'triangle');
  };
  const beep=(hz:number,duration=.07)=>{arm();if(ctx)tone(ctx.currentTime+.004,hz,hz*.82,duration,.045,0,'sine');};
  return {arm,fire,shell,click:()=>beep(420,.04),blast:()=>beep(90,.16),alert:()=>beep(760,.12),destroy:()=>{void ctx?.close();ctx=undefined;master=undefined;noise=undefined;}};
}
