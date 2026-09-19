import type { SharedGPU, WorldMap } from '../../contracts/index.ts';
import {
  BOSS_BYTES,
  BOSS_HEALTH,
  BOSS_LEAK,
  BOSS_MASS,
  BOSS_PHASE_SECONDS,
  BOSS_RADIUS,
  BOSS_REWARD,
  initialBossState,
} from './model.ts';

const WORKGROUP_SIZE = 128;
const PARAM_BYTES = 64;

export interface BossFrame {
  dt: number;
  tick: number;
  count: number;
  map: WorldMap;
  active: boolean;
}

export interface BossModule {
  readonly buffer: GPUBuffer;
  reset(active: boolean): void;
  encode(encoder: GPUCommandEncoder, frame: BossFrame): void;
  encodeResolve(encoder: GPUCommandEncoder, frame: BossFrame): void;
  destroy(): void;
}

const BOSS_WGSL = /* wgsl */ `
struct Particle { pos: vec4<f32>, body: vec4<f32>, state: vec4<f32>, status: vec4<f32> };
struct Boss { motion: vec4<f32>, body: vec4<f32>, mode: vec4<f32>, flags: vec4<f32> };
struct Params { clock: vec4<f32>, world: vec4<f32>, spawn: vec4<f32>, rules: vec4<f32> };

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> bossState: Boss;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> counters: array<atomic<u32>>;

const PHASE_ADVANCE: u32 = 0u;
const PHASE_BRACE: u32 = 1u;
const PHASE_CHARGE: u32 = 2u;
const PHASE_RECOVER: u32 = 3u;
const PHASE_DEAD: u32 = 4u;
const PHASE_LEAKED: u32 = 5u;

fn safeDirection(delta: vec2<f32>) -> vec2<f32> {
  let magnitude = length(delta);
  if (magnitude <= 0.0001) { return vec2<f32>(1.0, 0.0); }
  return delta / magnitude;
}

@compute @workgroup_size(1)
fn advanceBoss() {
  var boss = bossState;
  if (params.clock.w < 0.5 || boss.mode.z < 0.5 || boss.mode.w > 0.5) { return; }

  if (boss.mode.x < 0.0) {
    boss.motion = vec4<f32>(params.spawn.x + min(params.spawn.z * 0.2, 2.0), params.spawn.y + params.spawn.w * 0.5, 0.0, 0.0);
    boss.body = vec4<f32>(${BOSS_RADIUS}, ${BOSS_MASS}, ${BOSS_HEALTH}, ${BOSS_HEALTH});
    boss.mode = vec4<f32>(f32(PHASE_ADVANCE), 0.0, 1.0, 0.0);
    boss.flags = vec4<f32>(boss.flags.x, ${BOSS_REWARD}, ${BOSS_LEAK}, 0.0);
  }

  if (boss.body.z <= 0.0) {
    boss.body.z = 0.0;
    boss.motion = vec4<f32>(boss.motion.xy, vec2<f32>(0.0));
    boss.mode.x = f32(PHASE_DEAD);
    bossState = boss;
    return;
  }

  var phase = u32(clamp(boss.mode.x, 0.0, 5.0) + 0.5);
  var timer = boss.mode.y + params.clock.x;
  if (phase == PHASE_ADVANCE && timer >= ${BOSS_PHASE_SECONDS.advance}) {
    phase = PHASE_BRACE;
    timer -= ${BOSS_PHASE_SECONDS.advance};
  } else if (phase == PHASE_BRACE && timer >= ${BOSS_PHASE_SECONDS.brace}) {
    phase = PHASE_CHARGE;
    timer -= ${BOSS_PHASE_SECONDS.brace};
  } else if (phase == PHASE_CHARGE && timer >= ${BOSS_PHASE_SECONDS.charge}) {
    phase = PHASE_RECOVER;
    timer -= ${BOSS_PHASE_SECONDS.charge};
  } else if (phase == PHASE_RECOVER && timer >= ${BOSS_PHASE_SECONDS.recover}) {
    phase = PHASE_ADVANCE;
    timer -= ${BOSS_PHASE_SECONDS.recover};
  }

  let goal = params.world.zw;
  let direction = safeDirection(goal - boss.motion.xy);
  var speed = 1.65;
  if (phase == PHASE_BRACE) { speed = 0.0; }
  if (phase == PHASE_CHARGE) { speed = 7.5; }
  if (phase == PHASE_RECOVER) { speed = 0.3; }
  let slowMultiplier = select(1.0, 0.6, boss.flags.w > 0.0);
  boss.flags.w = max(0.0, boss.flags.w - params.clock.x);
  let nextVelocity = direction * speed * slowMultiplier;
  let nextPosition = clamp(
    boss.motion.xy + nextVelocity * params.clock.x,
    vec2<f32>(boss.body.x),
    params.world.xy - vec2<f32>(boss.body.x),
  );
  boss.motion = vec4<f32>(nextPosition, nextVelocity);
  boss.mode.x = f32(phase);
  boss.mode.y = timer;

  if (distance(boss.motion.xy, goal) <= params.rules.x + boss.body.x) {
    boss.motion = vec4<f32>(boss.motion.xy, vec2<f32>(0.0));
    boss.mode.x = f32(PHASE_LEAKED);
  }
  bossState = boss;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn pushParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= u32(params.clock.z)) { return; }
  let boss = bossState;
  let phase = u32(clamp(boss.mode.x, 0.0, 5.0) + 0.5);
  if (boss.mode.z < 0.5 || boss.mode.w > 0.5 || boss.body.z <= 0.0 || phase >= PHASE_DEAD) { return; }
  var particle = particles[index];
  if (particle.state.w < 0.5 || particle.body.z <= 0.0) { return; }

  let radius = clamp(abs(particle.body.x), 0.05, 0.45);
  let mass = clamp(abs(particle.body.y), 0.1, 100.0);
  let delta = particle.pos.xy - boss.motion.xy;
  let separation = length(delta);
  let contactDistance = boss.body.x + radius;
  if (separation >= contactDistance) { return; }

  var normal = safeDirection(delta);
  if (separation <= 0.0001) { normal = safeDirection(boss.motion.zw); }
  let overlap = contactDistance - separation;
  let force = select(72.0, 180.0, phase == PHASE_CHARGE);
  var nextParticleVelocity = particle.pos.zw + normal * force * overlap * params.clock.x / mass;
  nextParticleVelocity += (boss.motion.zw - nextParticleVelocity) * min(0.35, overlap / contactDistance) * params.clock.x * 4.0;
  let nextParticlePosition = particle.pos.xy + normal * min(0.18, overlap * 0.35);
  particle.pos = vec4<f32>(nextParticlePosition, nextParticleVelocity);
  particles[index] = particle;
}

@compute @workgroup_size(1)
fn resolveBoss() {
  var boss = bossState;
  let phase = u32(clamp(boss.mode.x, 0.0, 5.0) + 0.5);
  if (boss.mode.z > 0.5 && boss.mode.w < 0.5) {
    if (boss.body.z <= 0.0 || phase == PHASE_DEAD) {
      boss.body.z = 0.0;
      boss.motion = vec4<f32>(boss.motion.xy, vec2<f32>(0.0));
      boss.mode.x = f32(PHASE_DEAD);
      boss.mode.z = 0.0;
      boss.mode.w = 1.0;
      atomicAdd(&counters[0], 1u);
      atomicAdd(&counters[3], u32(boss.flags.y));
    } else if (phase == PHASE_LEAKED) {
      boss.mode.z = 0.0;
      boss.mode.w = 1.0;
      atomicAdd(&counters[2], u32(boss.flags.z));
    } else {
      atomicAdd(&counters[4], 1u);
    }
  }

  atomicStore(&counters[7], u32(max(0.0, boss.body.z) * 100.0));
  atomicStore(&counters[8], u32(max(0.0, boss.body.w) * 100.0));
  atomicStore(&counters[9], u32(max(0.0, boss.mode.x)));
  atomicStore(&counters[10], u32(max(0.0, boss.motion.x) * 100.0));
  atomicStore(&counters[11], u32(max(0.0, boss.motion.y) * 100.0));
  atomicStore(&counters[12], u32(max(0.0, boss.mode.z)));
  atomicStore(&counters[13], u32(max(0.0, boss.mode.w)));
  bossState = boss;
}
`;

function validateFrame(frame: BossFrame, capacity: number): void {
  if (!(frame.dt > 0) || !Number.isFinite(frame.dt) || frame.dt > 0.1) {
    throw new RangeError(`Boss dt must be finite and in (0, 0.1], received ${frame.dt}.`);
  }
  if (!Number.isInteger(frame.count) || frame.count < 0 || frame.count > capacity) {
    throw new RangeError(`Boss particle count ${frame.count} exceeds shared capacity ${capacity}.`);
  }
  if (!(frame.map.width > BOSS_RADIUS * 2) || !(frame.map.height > BOSS_RADIUS * 2)) {
    throw new RangeError('Boss map is too small for its collision body.');
  }
}

function packParams(frame: BossFrame): Float32Array {
  return new Float32Array([
    frame.dt,
    frame.tick,
    frame.count,
    frame.active ? 1 : 0,
    frame.map.width,
    frame.map.height,
    frame.map.goal.x,
    frame.map.goal.y,
    frame.map.spawn.x,
    frame.map.spawn.y,
    frame.map.spawn.width,
    frame.map.spawn.height,
    frame.map.goalRadius,
    0,
    0,
    0,
  ]);
}

export async function createBoss(device: GPUDevice, shared: SharedGPU): Promise<BossModule> {
  const buffer = device.createBuffer({
    label: 'Boss state',
    size: BOSS_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const uniforms = device.createBuffer({
    label: 'Boss parameters',
    size: PARAM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  shared.bossState = buffer;

  const module = device.createShaderModule({ label: 'Boss compute', code: BOSS_WGSL });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === 'error');
  if (errors.length > 0) {
    buffer.destroy();
    uniforms.destroy();
    if (shared.bossState === buffer) shared.bossState = undefined;
    throw new Error(`Boss shader compilation failed:\n${errors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n')}`);
  }

  const layout = device.createBindGroupLayout({
    label: 'Boss bind group layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ label: 'Boss pipeline layout', bindGroupLayouts: [layout] });
  const [advancePipeline, pushPipeline, resolvePipeline] = await Promise.all([
    device.createComputePipelineAsync({ label: 'Advance boss', layout: pipelineLayout, compute: { module, entryPoint: 'advanceBoss' } }),
    device.createComputePipelineAsync({ label: 'Boss particle contacts', layout: pipelineLayout, compute: { module, entryPoint: 'pushParticles' } }),
    device.createComputePipelineAsync({ label: 'Resolve boss', layout: pipelineLayout, compute: { module, entryPoint: 'resolveBoss' } }),
  ]);
  const bindGroup = device.createBindGroup({
    label: 'Boss bind group',
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniforms } },
      { binding: 1, resource: { buffer } },
      { binding: 2, resource: { buffer: shared.particles } },
      { binding: 3, resource: { buffer: shared.counters } },
    ],
  });

  let generation = 0;
  let destroyed = false;
  const encodePass = (encoder: GPUCommandEncoder, label: string, pipeline: GPUComputePipeline, groups: number) => {
    const pass = encoder.beginComputePass({ label });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(groups);
    pass.end();
  };

  return {
    buffer,

    reset(active: boolean): void {
      if (destroyed) return;
      generation += 1;
      device.queue.writeBuffer(buffer, 0, initialBossState(active, generation));
    },

    encode(encoder: GPUCommandEncoder, frame: BossFrame): void {
      if (destroyed) throw new Error('Cannot encode with a destroyed boss module.');
      validateFrame(frame, shared.capacity);
      device.queue.writeBuffer(uniforms, 0, packParams(frame));
      encodePass(encoder, 'Advance boss state', advancePipeline, 1);
      if (frame.count > 0) {
        encodePass(encoder, 'Boss particle contacts', pushPipeline, Math.ceil(frame.count / WORKGROUP_SIZE));
      }
    },

    encodeResolve(encoder: GPUCommandEncoder, frame: BossFrame): void {
      if (destroyed) throw new Error('Cannot resolve with a destroyed boss module.');
      validateFrame(frame, shared.capacity);
      encodePass(encoder, 'Resolve boss settlement', resolvePipeline, 1);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (shared.bossState === buffer) shared.bossState = undefined;
      buffer.destroy();
      uniforms.destroy();
    },
  };
}

export {
  BOSS_BYTES,
  BOSS_FLOATS,
  BOSS_HEALTH,
  BOSS_LEAK,
  BOSS_PHASE,
  BOSS_RADIUS,
  BOSS_REWARD,
} from './model.ts';
