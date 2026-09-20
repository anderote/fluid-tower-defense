import type {EnemyKind, UIState} from '../contracts/index.ts';
import {ENEMIES} from '../content/index.ts';
import {waveFor} from './index.ts';

const ROLES: Record<EnemyKind, string> = {
  shambler: 'Baseline crowd; vulnerable to compression.',
  runner: 'Fast and fragile; cover gaps with precise fire.',
  brute: 'Heavy and crush-resistant; focus sustained damage.',
};

type PreviewState = Pick<UIState, 'mode' | 'phase' | 'level' | 'wave' | 'difficulty'>;

/** Read-only forecast of the same composition startWave queues. Bosses spawn separately. */
export function previewNextWave(state: PreviewState) {
  if (state.mode !== 'game' || state.phase !== 'preparation') return null;
  const wave = state.wave + 1;
  const definition = waveFor(state.level, wave);
  return {
    level: state.level,
    wave,
    enemies: definition.spawns.map(batch => ({
      kind: batch.kind,
      name: ENEMIES[batch.kind].name,
      count: batch.count,
      role: ROLES[batch.kind],
    })),
    total: definition.spawns.reduce((sum, batch) => sum + batch.count, 0),
    boss: definition.boss,
    payment: definition.payment,
    peakRate: definition.peakRate * state.difficulty,
    rampSeconds: definition.rampSeconds,
  };
}
