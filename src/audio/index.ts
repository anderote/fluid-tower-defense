import type {TowerKind} from '../contracts/index.ts';

/** Dry synthesized weapon layers plus attributed OpenSoldat heavy-weapon samples. */
export function createAudio(){
  let ctx:AudioContext|undefined,master:GainNode|undefined,noise:AudioBuffer|undefined;
  const samples:Partial<Record<'m79Fire'|'m79Explosion'|'law',AudioBuffer>>={};
  let samplesLoading=false;

  const loadSamples=()=>{
    if(!ctx||samplesLoading)return;samplesLoading=true;
    const files={m79Fire:'/audio/soldat/m79-fire.wav',m79Explosion:'/audio/soldat/m79-explosion.wav',law:'/audio/soldat/law.wav'} as const;
    for(const [name,url] of Object.entries(files) as [keyof typeof files,string][]){
      void fetch(url).then(response=>{if(!response.ok)throw new Error(`${response.status} ${url}`);return response.arrayBuffer();}).then(data=>ctx?.decodeAudioData(data)).then(buffer=>{if(buffer)samples[name]=buffer;}).catch(error=>console.warn('OpenSoldat sound unavailable; using synthesized fallback.',error));
    }
  };

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
    loadSamples();
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
  const sample=(name:keyof typeof samples,at:number,gain:number,pan:number,rate=1)=>{
    const buffer=samples[name];if(!ctx||!buffer)return false;const source=ctx.createBufferSource(),envelope=ctx.createGain();source.buffer=buffer;source.playbackRate.value=rate;envelope.gain.value=gain;source.connect(envelope);output(envelope,pan);source.start(at);return true;
  };
  const fire=(kind:TowerKind,x:number,serial=0)=>{
    if(!ctx||!master)return;const at=ctx.currentTime+.008,pan=stereo(x),jitter=((serial*37)%17-8)/100;
    switch(kind){
      case 'autocannon':
        hiss(at,.055,.23,720,7600,pan,serial*.071);tone(at,132*(1+jitter),58,.075,.16,pan,'sawtooth');tone(at+.008,980*(1+jitter),410,.035,.035,pan,'square');break;
      case 'railgun':
        hiss(at,.09,.2,1100,11000,pan,serial*.113);tone(at,92,42,.14,.2,pan,'sawtooth');tone(at,2100*(1+jitter),620,.12,.065,pan,'square');break;
      case 'mortar':
        if(!sample('m79Fire',at,.72,pan,.98+jitter*.08)){hiss(at,.12,.17,80,2100,pan,serial*.191);tone(at,78,31,.2,.24,pan,'sine');}break;
      case 'rocket':
        if(!sample('law',at,.58,pan,.98+jitter*.05)){hiss(at,.24,.16,90,3200,pan,serial*.137);tone(at,68,34,.18,.19,pan,'sawtooth');}break;
      case 'tesla':
        hiss(at,.065,.2,1800,12000,pan,serial*.097);tone(at,1550*(1+jitter),120,.18,.095,pan,'sawtooth');
        for(let crack=1;crack<=3;crack++)hiss(at+crack*.035,.026,.065,2800,10000,pan,serial*.097+crack*.13);
        tone(at+.015,105,38,.13,.08,pan,'sine');break;
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
  const explode=(kind:'mortar'|'rocket',x:number,serial=0)=>{
    if(!ctx)return;const at=ctx.currentTime+.006,pan=stereo(x),rate=kind==='rocket'?.9:.98+((serial*13)%7-3)*.008;
    if(!sample('m79Explosion',at,kind==='rocket'?.68:.57,pan,rate)){hiss(at,.3,.25,32,2600,pan,serial*.227);tone(at,62,24,.34,.27,pan,'sine');}
    // A compact low-frequency pressure layer gives the old sample weight on modern speakers.
    tone(at,kind==='rocket'?58:72,24,kind==='rocket'?.34:.25,kind==='rocket'?.16:.11,pan,'sine');
  };
  const beep=(hz:number,duration=.07)=>{arm();if(ctx)tone(ctx.currentTime+.004,hz,hz*.82,duration,.045,0,'sine');};
  return {arm,fire,shell,explode,click:()=>beep(420,.04),blast:()=>beep(90,.16),alert:()=>beep(760,.12),destroy:()=>{void ctx?.close();ctx=undefined;master=undefined;noise=undefined;}};
}
