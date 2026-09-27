import type {UIState} from '../contracts/index.ts';

/** Count queued enemies too: an empty arena alone does not mean a cleared wave. */
export function canFinishWaveEarly(progress:UIState['waveProgress'],phase:UIState['phase'],bossActive=false):boolean{
  return (phase==='combat'||phase==='settling')&&!bossActive&&!!progress&&progress.total>0&&
    progress.queued+progress.live<=Math.floor(progress.total*.05);
}
