import { COUNTER_WORDS, PARTICLE_BYTES, type SharedGPU, type WorldMap } from '../../contracts/index.ts';
import { createBoss, type BossFrame } from './index.ts';
import { BOSS_BYTES, BOSS_HEALTH, BOSS_LEAK, BOSS_PHASE, BOSS_REWARD } from './model.ts';

export interface BossGPUCheckResult {
  spawn: { x: number; y: number };
  phase: number;
  health: number;
  live: number;
  deathKills: number;
  deathReward: number;
  leakDamage: number;
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
    size: BOSS_BYTES + COUNTER_WORDS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const shared: SharedGPU = { particles, counters, capacity: 1 };
  const boss = await createBoss(device, shared);
  let tick = 0;

  const frame = (active: boolean): BossFrame => ({ dt: 1 / 60, tick: ++tick, count: 0, map, active });
  const snapshot = async (): Promise<{ state: Float32Array; counters: Uint32Array }> => {
    const encoder = device.createCommandEncoder({ label: 'Read boss GPU check' });
    encoder.copyBufferToBuffer(boss.buffer, 0, readback, 0, BOSS_BYTES);
    encoder.copyBufferToBuffer(counters, 0, readback, BOSS_BYTES, COUNTER_WORDS * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(readback.getMappedRange());
    const state = new Float32Array(bytes.slice(0, BOSS_BYTES).buffer);
    const values = new Uint32Array(bytes.slice(BOSS_BYTES).buffer);
    readback.unmap();
    return { state, counters: values };
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
    };
  } finally {
    boss.destroy();
    particles.destroy();
    counters.destroy();
    readback.destroy();
  }
}
