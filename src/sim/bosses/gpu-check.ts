import {
  COUNTER_WORDS,
  DEFAULT_TUNING,
  PARTICLE_BYTES,
  type SharedGPU,
  type Tower,
  type TowerDef,
  type WorldMap,
} from '../../contracts/index.ts';
import { createCombat, type CombatFrame } from '../combat/index.ts';
import { createBoss, type BossFrame } from './index.ts';
import { BOSS_BYTES, BOSS_HEALTH, BOSS_LEAK, BOSS_PHASE, BOSS_REWARD } from './model.ts';

const SHOT_BYTES = 48;

export interface BossGPUCheckResult {
  spawn: { x: number; y: number };
  phase: number;
  health: number;
  live: number;
  deathKills: number;
  deathReward: number;
  leakDamage: number;
  targetedBoss: boolean;
  towerDamage: number;
  transitionedPhase: number;
}

/**
 * Destructive isolated adapter check for a development validation route.
 * It allocates its own shared buffers and submits commands; gameplay modules never call it.
 */
export async function runBossGPUChecks(device: GPUDevice, map: WorldMap): Promise<BossGPUCheckResult> {
  const particles = device.createBuffer({
    label: 'Boss check particles',
    size: PARTICLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const counters = device.createBuffer({
    label: 'Boss check counters',
    size: COUNTER_WORDS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    label: 'Boss check readback',
    size: BOSS_BYTES + COUNTER_WORDS * 4 + SHOT_BYTES,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const shared: SharedGPU = { particles, counters, capacity: 1 };
  const boss = await createBoss(device, shared);
  const combat = await createCombat(device, shared);
  let tick = 0;

  const frame = (active: boolean, dt = 1 / 60): BossFrame => ({ dt, tick: ++tick, count: 0, map, active });
  const snapshot = async (): Promise<{ state: Float32Array; counters: Uint32Array; shot: Float32Array }> => {
    const encoder = device.createCommandEncoder({ label: 'Read boss GPU check' });
    encoder.copyBufferToBuffer(boss.buffer, 0, readback, 0, BOSS_BYTES);
    encoder.copyBufferToBuffer(counters, 0, readback, BOSS_BYTES, COUNTER_WORDS * 4);
    encoder.copyBufferToBuffer(combat.shotState, 0, readback, BOSS_BYTES + COUNTER_WORDS * 4, SHOT_BYTES);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(readback.getMappedRange());
    const state = new Float32Array(bytes.slice(0, BOSS_BYTES).buffer);
    const values = new Uint32Array(bytes.slice(BOSS_BYTES, BOSS_BYTES + COUNTER_WORDS * 4).buffer);
    const shot = new Float32Array(bytes.slice(BOSS_BYTES + COUNTER_WORDS * 4).buffer);
    readback.unmap();
    return { state, counters: values, shot };
  };
  const submitTick = (active: boolean) => {
    const next = frame(active);
    const encoder = device.createCommandEncoder({ label: `Boss GPU check tick ${next.tick}` });
    boss.encode(encoder, next);
    encoder.clearBuffer(counters, 4 * 4, 4);
    boss.encodeResolve(encoder, next);
    device.queue.submit([encoder.finish()]);
  };

  try {
    device.queue.writeBuffer(counters, 0, new Uint32Array(COUNTER_WORDS));
    boss.reset(true);
    submitTick(true);
    const initial = await snapshot();
    if (
      initial.state[8] !== BOSS_PHASE.advance ||
      initial.state[6] !== BOSS_HEALTH ||
      initial.counters[4] !== 1
    ) {
      throw new Error(`Boss initialization check failed: phase=${initial.state[8]}, hp=${initial.state[6]}, live=${initial.counters[4]}`);
    }

    const tower: Tower = {
      id: 9001,
      kind: 'autocannon',
      x: initial.state[0] - 2,
      y: initial.state[1],
      level: 0,
      branch: -1,
      angle: 0,
      cooldown: 0,
      spent: 0,
    };
    const definition: TowerDef = {
      id: 'autocannon',
      name: 'Boss check cannon',
      description: 'GPU validation fixture',
      cost: 1,
      range: 10,
      cooldown: 1,
      damage: 50,
      force: 0,
      radius: 0.5,
      peakPressureKpa: 180,
      color: '#fff',
      branches: ['A', 'B'],
    };
    const combatFrame: CombatFrame = {
      dt: 1 / 60,
      tick: ++tick,
      count: 0,
      map,
      effects: [],
      tuning: DEFAULT_TUNING,
      lab: false,
      towers: [{ tower, definition }],
    };
    const combatEncoder = device.createCommandEncoder({ label: 'Boss GPU targeting check' });
    combat.encodeBefore(combatEncoder, combatFrame);
    device.queue.submit([combatEncoder.finish()]);
    const targeted = await snapshot();
    const targetedBoss = targeted.shot[4] === 1 && targeted.shot[5] === -1 && targeted.shot[6] === targeted.state[12];
    const towerDamage = initial.state[6] - targeted.state[6];
    if (!targetedBoss || Math.abs(towerDamage - definition.damage) > 0.001) {
      throw new Error(`Boss targeting check failed: fired=${targeted.shot[4]}, target=${targeted.shot[5]}, generation=${targeted.shot[6]}/${targeted.state[12]}, damage=${towerDamage}`);
    }

    // All encoded steps share dt/active values, so one uniform upload may safely serve the batch.
    const phaseEncoder = device.createCommandEncoder({ label: 'Boss GPU phase transition check' });
    for (let step = 0; step < 51; step += 1) boss.encode(phaseEncoder, frame(true, 0.1));
    device.queue.submit([phaseEncoder.finish()]);
    const transitioned = await snapshot();
    if (transitioned.state[8] !== BOSS_PHASE.brace) {
      throw new Error(`Boss phase transition check failed: expected brace, received ${transitioned.state[8]}`);
    }

    device.queue.writeBuffer(boss.buffer, 6 * 4, new Float32Array([0]));
    submitTick(true);
    const dead = await snapshot();
    submitTick(true);
    const deadAgain = await snapshot();
    if (
      dead.state[8] !== BOSS_PHASE.dead ||
      dead.counters[0] !== 1 ||
      dead.counters[3] !== BOSS_REWARD ||
      deadAgain.counters[0] !== 1 ||
      deadAgain.counters[3] !== BOSS_REWARD
    ) {
      throw new Error(`Boss death settlement check failed: kills=${dead.counters[0]}/${deadAgain.counters[0]}, reward=${dead.counters[3]}/${deadAgain.counters[3]}`);
    }

    device.queue.writeBuffer(counters, 0, new Uint32Array(COUNTER_WORDS));
    boss.reset(true);
    submitTick(false);
    const dormant = await snapshot();
    if (dormant.state[8] !== -1 || dormant.counters[4] !== 0) {
      throw new Error(`Inactive-frame check failed: phase=${dormant.state[8]}, live=${dormant.counters[4]}`);
    }

    const leakMode = new Float32Array([BOSS_PHASE.leaked, 0, 1, 0]);
    device.queue.writeBuffer(boss.buffer, 8 * 4, leakMode);
    submitTick(true);
    const leaked = await snapshot();
    submitTick(true);
    const leakedAgain = await snapshot();
    if (leaked.counters[2] !== BOSS_LEAK || leakedAgain.counters[2] !== BOSS_LEAK || leaked.counters[4] !== 0) {
      throw new Error(`Boss leak settlement check failed: leaks=${leaked.counters[2]}/${leakedAgain.counters[2]}, live=${leaked.counters[4]}`);
    }

    return {
      spawn: { x: initial.state[0], y: initial.state[1] },
      phase: initial.state[8],
      health: initial.state[6],
      live: initial.counters[4],
      deathKills: deadAgain.counters[0],
      deathReward: deadAgain.counters[3],
      leakDamage: leakedAgain.counters[2],
      targetedBoss,
      towerDamage,
      transitionedPhase: transitioned.state[8],
    };
  } finally {
    combat.destroy();
    boss.destroy();
    particles.destroy();
    counters.destroy();
    readback.destroy();
  }
}
