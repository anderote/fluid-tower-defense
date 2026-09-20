import {
  MAX_EFFECTS,
  MAX_OBSTACLES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Effect,
  type NavigationField,
  type PhysicsFrame,
  type PhysicsModule,
  type SharedGPU,
} from '../../contracts/index.ts';
import {
  PHYSICS_CELL_SIZE,
  PHYSICS_KERNEL_RADIUS,
  PHYSICS_SUBSTEPS,
} from './model.ts';
import { PHYSICS_WGSL } from './shader.ts';

const WORKGROUP_SIZE = 128;
const PARAM_BYTES = 112;
const OBSTACLE_BYTES = 16;
const EFFECT_BYTES = 48;
const NAV_BYTES = 16;
const MAX_GRID_CELLS = Math.ceil(WORLD_WIDTH / PHYSICS_CELL_SIZE) * Math.ceil(WORLD_HEIGHT / PHYSICS_CELL_SIZE);

const EFFECT_KIND: Record<Effect['kind'], number> = { blast: 0, push: 1, slow: 2, shot: 3 };

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function packNavigation(field: NavigationField): Float32Array {
  const cells = field.width * field.height;
  if (!Number.isInteger(field.width) || !Number.isInteger(field.height) || field.width <= 0 || field.height <= 0) {
    throw new RangeError('Navigation dimensions must be positive integers.');
  }
  if (!(field.cellSize > 0) || !Number.isFinite(field.cellSize)) {
    throw new RangeError('Navigation cellSize must be finite and positive.');
  }
  if (field.vectors.length < cells * 2 || field.alternateVectors.length < cells * 2 || field.distances.length < cells) {
    throw new RangeError('Navigation arrays are smaller than their declared dimensions.');
  }
  const packed = new Float32Array(cells * 4);
  for (let index = 0; index < cells; index += 1) {
    packed[index * 4] = finite(field.vectors[index * 2]);
    packed[index * 4 + 1] = finite(field.vectors[index * 2 + 1]);
    packed[index * 4 + 2] = finite(field.alternateVectors[index * 2]);
    packed[index * 4 + 3] = finite(field.alternateVectors[index * 2 + 1]);
  }
  return packed;
}

function packObstacles(frame: PhysicsFrame): Float32Array {
  const packed = new Float32Array(frame.map.obstacles.length * 4);
  frame.map.obstacles.forEach((obstacle, index) => {
    const offset = index * 4;
    packed[offset] = finite(obstacle.x);
    packed[offset + 1] = finite(obstacle.y);
    packed[offset + 2] = Math.max(0, finite(obstacle.width));
    packed[offset + 3] = Math.max(0, finite(obstacle.height));
  });
  return packed;
}

function packEffects(effects: readonly Effect[]): Float32Array {
  const packed = new Float32Array(effects.length * 12);
  effects.forEach((effect, index) => {
    const offset = index * 12;
    packed[offset] = finite(effect.x);
    packed[offset + 1] = finite(effect.y);
    packed[offset + 2] = Math.max(0, finite(effect.radius));
    packed[offset + 4] = finite(effect.strength);
    packed[offset + 5] = finite(effect.damage);
    packed[offset + 6] = finite(effect.direction.x);
    packed[offset + 7] = finite(effect.direction.y);
    packed[offset + 8] = EFFECT_KIND[effect.kind];
    packed[offset + 9] = Math.max(0, finite(effect.cone));
    packed[offset + 10] = Math.max(0, finite(effect.duration));
    packed[offset + 11] = finite(effect.source);
  });
  return packed;
}

function packParams(
  frame: PhysicsFrame,
  capacity: number,
  gridWidth: number,
  gridHeight: number,
  substepIndex: number,
): ArrayBuffer {
  const storage = new ArrayBuffer(PARAM_BYTES);
  const u32 = new Uint32Array(storage);
  const f32 = new Float32Array(storage);
  u32[0] = frame.count;
  u32[1] = capacity;
  u32[2] = gridWidth;
  u32[3] = gridHeight;
  u32[4] = frame.map.obstacles.length;
  u32[5] = frame.effects.length;
  u32[6] = frame.navigation?.width ?? 0;
  u32[7] = frame.navigation?.height ?? 0;
  f32[8] = frame.dt / PHYSICS_SUBSTEPS;
  f32[9] = frame.dt;
  f32[10] = PHYSICS_CELL_SIZE;
  f32[11] = frame.navigation?.cellSize ?? 1;
  f32[12] = frame.map.width;
  f32[13] = frame.map.height;
  f32[14] = Math.max(0, finite(frame.tuning.pressure));
  f32[15] = Math.max(0, finite(frame.tuning.viscosity));
  f32[16] = Math.max(0, finite(frame.tuning.drive));
  f32[17] = Math.max(0, finite(frame.tuning.crushThreshold));
  f32[18] = Math.max(0, finite(frame.tuning.crushDamage));
  f32[19] = 1;
  f32[20] = finite(frame.map.goal.x, frame.map.width);
  f32[21] = finite(frame.map.goal.y, frame.map.height * 0.5);
  f32[22] = PHYSICS_KERNEL_RADIUS;
  u32[23] = substepIndex;
  u32[24] = PHYSICS_SUBSTEPS;
  return storage;
}

function validateFrame(frame: PhysicsFrame, shared: SharedGPU): void {
  if (!Number.isInteger(frame.count) || frame.count < 0 || frame.count > shared.capacity) {
    throw new RangeError(`Physics count ${frame.count} exceeds shared capacity ${shared.capacity}.`);
  }
  if (!(frame.dt > 0) || !Number.isFinite(frame.dt) || frame.dt > 0.1) {
    throw new RangeError(`Physics dt must be finite and in (0, 0.1], received ${frame.dt}.`);
  }
  if (!(frame.map.width > 0) || !(frame.map.height > 0) || frame.map.width > WORLD_WIDTH || frame.map.height > WORLD_HEIGHT) {
    throw new RangeError(`Physics map must fit the ${WORLD_WIDTH}x${WORLD_HEIGHT} world contract.`);
  }
  if (frame.map.obstacles.length > MAX_OBSTACLES) {
    throw new RangeError(`Physics received ${frame.map.obstacles.length} obstacles; maximum is ${MAX_OBSTACLES}.`);
  }
  if (frame.effects.length > MAX_EFFECTS) {
    throw new RangeError(`Physics received ${frame.effects.length} effects; maximum is ${MAX_EFFECTS}.`);
  }
}

export async function createPhysics(device: GPUDevice, shared: SharedGPU): Promise<PhysicsModule> {
  if (shared.capacity <= 0 || !Number.isInteger(shared.capacity)) {
    throw new RangeError('Shared particle capacity must be a positive integer.');
  }

  const buffers: GPUBuffer[] = [];
  const makeBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer => {
    const buffer = device.createBuffer(descriptor);
    buffers.push(buffer);
    return buffer;
  };

  const cellHeads = makeBuffer({
    label: 'Physics cell heads',
    size: MAX_GRID_CELLS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const nextParticle = makeBuffer({
    label: 'Physics linked-list next indices',
    size: shared.capacity * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const motion = makeBuffer({
    label: 'Physics motion scratch',
    size: shared.capacity * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const obstacleBuffer = makeBuffer({
    label: 'Physics obstacles',
    size: MAX_OBSTACLES * OBSTACLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const effectBuffer = makeBuffer({
    label: 'Physics effects',
    size: MAX_EFFECTS * EFFECT_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const parameterBuffers = Array.from({ length: PHYSICS_SUBSTEPS }, (_, index) => makeBuffer({
    label: `Physics parameters ${index}`,
    size: PARAM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  }));

  let navigationBuffer = makeBuffer({
    label: 'Physics navigation',
    size: NAV_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  let navigationCapacity = 1;
  let navigationVersion = Number.NaN;
  let navigationWidth = 0;
  let navigationHeight = 0;
  let destroyed = false;

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Physics bind group layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ label: 'Physics pipeline layout', bindGroupLayouts: [bindGroupLayout] });
  const shader = device.createShaderModule({ label: 'Crowd physics', code: PHYSICS_WGSL });
  const compilation = await shader.getCompilationInfo();
  const shaderErrors = compilation.messages.filter((message) => message.type === 'error');
  if (shaderErrors.length > 0) {
    const details = shaderErrors
      .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`)
      .join('\n');
    throw new Error(`Crowd physics shader compilation failed:\n${details}`);
  }
  const [binPipeline, densityPipeline, motionPipeline, integrationPipeline] = await Promise.all([
    device.createComputePipelineAsync({ label: 'Physics bin particles', layout: pipelineLayout, compute: { module: shader, entryPoint: 'binParticles' } }),
    device.createComputePipelineAsync({ label: 'Physics measure density', layout: pipelineLayout, compute: { module: shader, entryPoint: 'measureDensity' } }),
    device.createComputePipelineAsync({ label: 'Physics compute motion', layout: pipelineLayout, compute: { module: shader, entryPoint: 'computeMotion' } }),
    device.createComputePipelineAsync({ label: 'Physics integrate particles', layout: pipelineLayout, compute: { module: shader, entryPoint: 'integrateParticles' } }),
  ]);

  let bindGroups: GPUBindGroup[] = [];
  const rebuildBindGroups = () => {
    bindGroups = parameterBuffers.map((parameterBuffer, index) => device.createBindGroup({
      label: `Physics bind group ${index}`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: shared.particles } },
        { binding: 1, resource: { buffer: cellHeads } },
        { binding: 2, resource: { buffer: nextParticle } },
        { binding: 3, resource: { buffer: motion } },
        { binding: 4, resource: { buffer: parameterBuffer } },
        { binding: 5, resource: { buffer: obstacleBuffer } },
        { binding: 6, resource: { buffer: effectBuffer } },
        { binding: 7, resource: { buffer: navigationBuffer } },
        { binding: 8, resource: { buffer: shared.counters } },
      ],
    }));
  };
  rebuildBindGroups();

  const ensureNavigationCapacity = (cells: number) => {
    if (cells <= navigationCapacity) return;
    const oldBuffer = navigationBuffer;
    navigationCapacity = nextPowerOfTwo(cells);
    navigationBuffer = makeBuffer({
      label: 'Physics navigation',
      size: navigationCapacity * NAV_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    rebuildBindGroups();
    oldBuffer.destroy();
  };

  return {
    encode(encoder: GPUCommandEncoder, frame: PhysicsFrame): void {
      if (destroyed) throw new Error('Cannot encode with a destroyed physics module.');
      validateFrame(frame, shared);
      const gridWidth = Math.ceil(frame.map.width / PHYSICS_CELL_SIZE);
      const gridHeight = Math.ceil(frame.map.height / PHYSICS_CELL_SIZE);
      const gridCells = gridWidth * gridHeight;

      if (frame.navigation) {
        const navCells = frame.navigation.width * frame.navigation.height;
        ensureNavigationCapacity(navCells);
        if (
          frame.navigation.version !== navigationVersion ||
          frame.navigation.width !== navigationWidth ||
          frame.navigation.height !== navigationHeight
        ) {
          const packedNavigation = packNavigation(frame.navigation);
          device.queue.writeBuffer(navigationBuffer, 0, packedNavigation);
          navigationVersion = frame.navigation.version;
          navigationWidth = frame.navigation.width;
          navigationHeight = frame.navigation.height;
        }
      } else {
        navigationVersion = Number.NaN;
        navigationWidth = 0;
        navigationHeight = 0;
      }

      const obstacles = packObstacles(frame);
      if (obstacles.byteLength > 0) device.queue.writeBuffer(obstacleBuffer, 0, obstacles);
      const effects = packEffects(frame.effects);
      if (effects.byteLength > 0) device.queue.writeBuffer(effectBuffer, 0, effects);
      parameterBuffers.forEach((buffer, index) => {
        device.queue.writeBuffer(buffer, 0, packParams(frame, shared.capacity, gridWidth, gridHeight, index));
      });

      if (frame.count === 0) return;
      const workgroups = Math.ceil(frame.count / WORKGROUP_SIZE);
      for (let substep = 0; substep < PHYSICS_SUBSTEPS; substep += 1) {
        encoder.clearBuffer(cellHeads, 0, gridCells * 4);
        const pass = encoder.beginComputePass({ label: `Crowd physics substep ${substep + 1}/${PHYSICS_SUBSTEPS}` });
        pass.setBindGroup(0, bindGroups[substep]);
        pass.setPipeline(binPipeline);
        pass.dispatchWorkgroups(workgroups);
        pass.setPipeline(densityPipeline);
        pass.dispatchWorkgroups(workgroups);
        pass.setPipeline(motionPipeline);
        pass.dispatchWorkgroups(workgroups);
        pass.setPipeline(integrationPipeline);
        pass.dispatchWorkgroups(workgroups);
        pass.end();
      }
    },

    reset(): void {
      if (destroyed) return;
      navigationVersion = Number.NaN;
      navigationWidth = 0;
      navigationHeight = 0;
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const buffer of buffers) buffer.destroy();
    },
  };
}
