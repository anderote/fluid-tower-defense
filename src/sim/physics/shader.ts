import { PARTICLE_WGSL } from '../../contracts/index.ts';

export const PHYSICS_WGSL = /* wgsl */ `
${PARTICLE_WGSL}

struct Params {
  count: u32,
  capacity: u32,
  gridWidth: u32,
  gridHeight: u32,
  obstacleCount: u32,
  effectCount: u32,
  navWidth: u32,
  navHeight: u32,
  dt: f32,
  fullDt: f32,
  cellSize: f32,
  navCellSize: f32,
  worldWidth: f32,
  worldHeight: f32,
  pressureStiffness: f32,
  viscosity: f32,
  drive: f32,
  crushThreshold: f32,
  crushDamage: f32,
  effectScale: f32,
  goalX: f32,
  goalY: f32,
  kernelRadius: f32,
  substepIndex: u32,
  substepCount: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

struct Obstacle { rect: vec4<f32> }
struct Effect {
  posRadius: vec4<f32>,
  data: vec4<f32>,
  flags: vec4<f32>,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cellHeads: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> nextParticle: array<u32>;
@group(0) @binding(3) var<storage, read_write> motion: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: Params;
@group(0) @binding(5) var<storage, read> obstacles: array<Obstacle>;
@group(0) @binding(6) var<storage, read> effects: array<Effect>;
@group(0) @binding(7) var<storage, read> navigation: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> counters: array<atomic<u32>>;

const PI: f32 = 3.141592653589793;
const MAX_FORCE: f32 = 90.0;
const MAX_SPEED: f32 = 30.0;
const MAX_DISPLACEMENT: f32 = 0.24;

fn finite1(v: f32) -> bool { return v == v && abs(v) < 1e20; }
fn finite2(v: vec2<f32>) -> bool { return finite1(v.x) && finite1(v.y); }
fn safeRadius(v: f32) -> f32 {
  if (!finite1(v)) { return 0.25; }
  return clamp(abs(v), 0.05, 0.45);
}
fn safeMass(v: f32) -> f32 {
  if (!finite1(v)) { return 1.0; }
  return clamp(abs(v), 0.1, 100.0);
}
fn occupiedArea(radius: f32) -> f32 { return PI * radius * radius; }

fn kernel(distance: f32) -> f32 {
  let q = max(0.0, 1.0 - distance / params.kernelRadius);
  return 6.0 / (PI * params.kernelRadius * params.kernelRadius) * q * q;
}

fn cellFor(position: vec2<f32>) -> vec2<i32> {
  return vec2<i32>(floor(position / params.cellSize));
}

fn validCell(cell: vec2<i32>) -> bool {
  return cell.x >= 0 && cell.y >= 0 && cell.x < i32(params.gridWidth) && cell.y < i32(params.gridHeight);
}

fn cellIndex(cell: vec2<i32>) -> u32 {
  return u32(cell.y) * params.gridWidth + u32(cell.x);
}

fn bodySpeed(kindValue: f32) -> f32 {
  var kind = 0u;
  if (finite1(kindValue)) { kind = u32(clamp(kindValue, 0.0, 2.0) + 0.5); }
  if (kind == 1u) { return 5.2; }
  if (kind == 2u) { return 2.1; }
  return 3.1;
}

fn flowDirection(position: vec2<f32>) -> vec2<f32> {
  if (params.navWidth > 0u && params.navHeight > 0u && params.navCellSize > 0.0) {
    let cell = vec2<i32>(floor(position / params.navCellSize));
    if (cell.x >= 0 && cell.y >= 0 && cell.x < i32(params.navWidth) && cell.y < i32(params.navHeight)) {
      let sample = navigation[u32(cell.y) * params.navWidth + u32(cell.x)].xy;
      let sampleLength = length(sample);
      if (finite2(sample) && sampleLength > 0.0001) { return sample / sampleLength; }
    }
  }
  let direct = vec2<f32>(params.goalX, params.goalY) - position;
  return direct / max(length(direct), 0.0001);
}

fn boundaryPacking(position: vec2<f32>, radius: f32) -> f32 {
  var result = 0.0;
  let area = occupiedArea(radius);
  let distances = vec4<f32>(position.x, params.worldWidth - position.x, position.y, params.worldHeight - position.y);
  for (var side = 0u; side < 4u; side += 1u) {
    let mirroredDistance = 2.0 * max(0.0, distances[side]);
    if (mirroredDistance < params.kernelRadius) { result += area * kernel(mirroredDistance); }
  }
  for (var obstacleIndex = 0u; obstacleIndex < params.obstacleCount; obstacleIndex += 1u) {
    let rect = obstacles[obstacleIndex].rect;
    let nearest = clamp(position, rect.xy, rect.xy + rect.zw);
    let distance = length(position - nearest);
    let mirroredDistance = 2.0 * distance;
    if (distance > 0.0001 && mirroredDistance < params.kernelRadius) {
      result += area * kernel(mirroredDistance);
    }
  }
  return result;
}

@compute @workgroup_size(128)
fn binParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.count || index >= params.capacity) { return; }
  nextParticle[index] = 0u;
  let particle = particles[index];
  if (particle.state.w < 0.5 || !finite2(particle.pos.xy)) { return; }
  let cell = cellFor(particle.pos.xy);
  if (!validCell(cell)) { return; }
  let previous = atomicExchange(&cellHeads[cellIndex(cell)], index + 1u);
  nextParticle[index] = previous;
}

@compute @workgroup_size(128)
fn measureDensity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.count || index >= params.capacity) { return; }
  let particle = particles[index];
  if (particle.state.w < 0.5 || !finite2(particle.pos.xy)) {
    particles[index].state.x = 0.0;
    particles[index].state.y = 0.0;
    return;
  }

  var packing = boundaryPacking(particle.pos.xy, safeRadius(particle.body.x));
  let centerCell = cellFor(particle.pos.xy);
  for (var oy = -1; oy <= 1; oy += 1) {
    for (var ox = -1; ox <= 1; ox += 1) {
      let cell = centerCell + vec2<i32>(ox, oy);
      if (!validCell(cell)) { continue; }
      var link = atomicLoad(&cellHeads[cellIndex(cell)]);
      while (link != 0u) {
        let otherIndex = link - 1u;
        let other = particles[otherIndex];
        if (other.state.w >= 0.5 && finite2(other.pos.xy)) {
          let distance = length(particle.pos.xy - other.pos.xy);
          if (distance < params.kernelRadius) {
            packing += occupiedArea(safeRadius(other.body.x)) * kernel(distance);
          }
        }
        link = nextParticle[otherIndex];
      }
    }
  }

  packing = clamp(packing, 0.0, 64.0);
  let pressure = min(200.0, max(0.0, params.pressureStiffness) * max(packing * packing - 1.0, 0.0));
  particles[index].state.x = packing;
  particles[index].state.y = pressure;
  atomicMax(&counters[6], u32(packing * 1000.0));
}

fn effectImpulse(position: vec2<f32>, mass: f32) -> vec2<f32> {
  if (params.substepIndex != 0u) { return vec2<f32>(0.0); }
  var impulse = vec2<f32>(0.0);
  for (var effectIndex = 0u; effectIndex < params.effectCount; effectIndex += 1u) {
    let effect = effects[effectIndex];
    let kind = u32(max(0.0, effect.flags.x) + 0.5);
    if (kind > 1u) { continue; }
    let offset = position - effect.posRadius.xy;
    let distance = length(offset);
    let radius = max(effect.posRadius.z, 0.0001);
    if (distance >= radius) { continue; }
    let falloff = 1.0 - distance / radius;
    if (kind == 0u) {
      let direction = offset / max(distance, 0.02);
      impulse += direction * effect.data.x * falloff * falloff / mass;
    } else {
      let directionLength = length(effect.data.zw);
      if (directionLength <= 0.0001) { continue; }
      let direction = effect.data.zw / directionLength;
      let cone = effect.flags.y;
      if (cone > 0.0 && distance > 0.02 && dot(offset / distance, direction) < cos(0.5 * cone)) { continue; }
      impulse += direction * effect.data.x * falloff / mass;
    }
  }
  return impulse * params.effectScale;
}

fn slowMultiplier(position: vec2<f32>, remaining: f32) -> f32 {
  var multiplier = select(1.0, 0.45, remaining > 0.0);
  for (var effectIndex = 0u; effectIndex < params.effectCount; effectIndex += 1u) {
    let effect = effects[effectIndex];
    let kind = u32(max(0.0, effect.flags.x) + 0.5);
    if (kind == 2u && distance(position, effect.posRadius.xy) < effect.posRadius.z) {
      multiplier = min(multiplier, 1.0 - clamp(effect.data.x, 0.0, 0.9));
    }
  }
  return multiplier;
}

@compute @workgroup_size(128)
fn computeMotion(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.count || index >= params.capacity) { return; }
  let particle = particles[index];
  if (particle.state.w < 0.5 || !finite2(particle.pos.xy) || !finite2(particle.pos.zw)) {
    motion[index] = vec4<f32>(0.0);
    return;
  }

  let position = particle.pos.xy;
  let velocity = particle.pos.zw;
  let radius = safeRadius(particle.body.x);
  let mass = safeMass(particle.body.y);
  let desiredVelocity = flowDirection(position) * bodySpeed(particle.state.z) * slowMultiplier(position, particle.status.x);
  var acceleration = (desiredVelocity - velocity) * max(0.0, params.drive) - velocity * 0.12;
  let centerCell = cellFor(position);

  for (var oy = -1; oy <= 1; oy += 1) {
    for (var ox = -1; ox <= 1; ox += 1) {
      let cell = centerCell + vec2<i32>(ox, oy);
      if (!validCell(cell)) { continue; }
      var link = atomicLoad(&cellHeads[cellIndex(cell)]);
      while (link != 0u) {
        let otherIndex = link - 1u;
        if (otherIndex != index) {
          let other = particles[otherIndex];
          if (other.state.w >= 0.5 && finite2(other.pos.xy) && finite2(other.pos.zw)) {
            let offset = position - other.pos.xy;
            let distance = length(offset);
            if (distance < params.kernelRadius && distance > 0.0001) {
              let normal = offset / distance;
              let q = 1.0 - distance / params.kernelRadius;
              let otherArea = occupiedArea(safeRadius(other.body.x));
              acceleration += normal * (particle.state.y + other.state.y) * otherArea * q * 0.055 / mass;
              acceleration += (other.pos.zw - velocity) * max(0.0, params.viscosity) * otherArea * kernel(distance) / mass;
              let contactDistance = radius + safeRadius(other.body.x);
              if (distance < contactDistance) {
                acceleration += normal * (contactDistance - distance) / max(contactDistance, 0.001) * 75.0 / mass;
              }
            } else if (distance <= 0.0001) {
              let angle = f32((index * 1664525u + otherIndex * 1013904223u) & 1023u) * (2.0 * PI / 1024.0);
              acceleration += vec2<f32>(cos(angle), sin(angle)) * 20.0 / mass;
            }
          }
        }
        link = nextParticle[otherIndex];
      }
    }
  }

  let accelerationLength = length(acceleration);
  if (accelerationLength > MAX_FORCE) { acceleration *= MAX_FORCE / accelerationLength; }
  motion[index] = vec4<f32>(acceleration, effectImpulse(position, mass));
}

fn sweepAabb(start: vec2<f32>, finish: vec2<f32>, minimum: vec2<f32>, maximum: vec2<f32>) -> vec4<f32> {
  let delta = finish - start;
  var nearTime = -1e20;
  var farTime = 1e20;
  var normal = vec2<f32>(0.0);

  if (abs(delta.x) < 0.000001) {
    if (start.x < minimum.x || start.x > maximum.x) { return vec4<f32>(0.0); }
  } else {
    let t1 = (minimum.x - start.x) / delta.x;
    let t2 = (maximum.x - start.x) / delta.x;
    let axisNear = min(t1, t2);
    let axisFar = max(t1, t2);
    if (axisNear > nearTime) {
      nearTime = axisNear;
      normal = vec2<f32>(select(1.0, -1.0, delta.x > 0.0), 0.0);
    }
    farTime = min(farTime, axisFar);
  }
  if (abs(delta.y) < 0.000001) {
    if (start.y < minimum.y || start.y > maximum.y) { return vec4<f32>(0.0); }
  } else {
    let t1 = (minimum.y - start.y) / delta.y;
    let t2 = (maximum.y - start.y) / delta.y;
    let axisNear = min(t1, t2);
    let axisFar = max(t1, t2);
    if (axisNear > nearTime) {
      nearTime = axisNear;
      normal = vec2<f32>(0.0, select(1.0, -1.0, delta.y > 0.0));
    }
    farTime = min(farTime, axisFar);
  }
  if (nearTime <= farTime && farTime >= 0.0 && nearTime >= 0.0 && nearTime <= 1.0) {
    return vec4<f32>(1.0, nearTime, normal);
  }
  return vec4<f32>(0.0);
}

fn resolveObstacle(start: vec2<f32>, finish: vec2<f32>, velocity: vec2<f32>, radius: f32, rect: vec4<f32>) -> vec4<f32> {
  let minimum = rect.xy - vec2<f32>(radius);
  let maximum = rect.xy + rect.zw + vec2<f32>(radius);
  var resultPosition = finish;
  var resultVelocity = velocity;

  if (start.x > minimum.x && start.x < maximum.x && start.y > minimum.y && start.y < maximum.y) {
    let sides = vec4<f32>(start.x - minimum.x, maximum.x - start.x, start.y - minimum.y, maximum.y - start.y);
    var normal = vec2<f32>(-1.0, 0.0);
    var depth = sides.x;
    if (sides.y < depth) { depth = sides.y; normal = vec2<f32>(1.0, 0.0); }
    if (sides.z < depth) { depth = sides.z; normal = vec2<f32>(0.0, -1.0); }
    if (sides.w < depth) { depth = sides.w; normal = vec2<f32>(0.0, 1.0); }
    resultPosition = start + normal * (depth + 0.001);
    let inward = dot(resultVelocity, normal);
    if (inward < 0.0) { resultVelocity -= normal * inward; }
    return vec4<f32>(resultPosition, resultVelocity);
  }

  let hit = sweepAabb(start, finish, minimum, maximum);
  if (hit.x > 0.5) {
    resultPosition = start + (finish - start) * max(0.0, hit.y - 0.001);
    let inward = dot(resultVelocity, hit.zw);
    if (inward < 0.0) { resultVelocity -= hit.zw * inward; }
  }
  return vec4<f32>(resultPosition, resultVelocity);
}

fn slowDuration(position: vec2<f32>, previous: f32) -> f32 {
  if (params.substepIndex != 0u) { return previous; }
  var remaining = max(0.0, previous - params.fullDt);
  for (var effectIndex = 0u; effectIndex < params.effectCount; effectIndex += 1u) {
    let effect = effects[effectIndex];
    let kind = u32(max(0.0, effect.flags.x) + 0.5);
    if (kind == 2u && distance(position, effect.posRadius.xy) < effect.posRadius.z) {
      remaining = max(remaining, max(0.0, effect.flags.z));
    }
  }
  return remaining;
}

@compute @workgroup_size(128)
fn integrateParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.count || index >= params.capacity) { return; }
  let particle = particles[index];
  if (particle.state.w < 0.5) { return; }

  var position = particle.pos.xy;
  var velocity = particle.pos.zw;
  var invalid = false;
  if (!finite2(position) || !finite2(velocity)) {
    position = vec2<f32>(params.worldWidth * 0.5, params.worldHeight * 0.5);
    velocity = vec2<f32>(0.0);
    invalid = true;
  }
  if (!finite1(particle.body.x) || !finite1(particle.body.y)) { invalid = true; }
  var previousSlow = particle.status.x;
  if (!finite1(previousSlow)) { previousSlow = 0.0; invalid = true; }
  var previousExposure = particle.status.z;
  if (!finite1(previousExposure)) { previousExposure = 0.0; invalid = true; }

  velocity += motion[index].xy * params.dt + motion[index].zw;
  let speed = length(velocity);
  if (!finite2(velocity)) {
    velocity = vec2<f32>(0.0);
    invalid = true;
  } else if (speed > MAX_SPEED) {
    velocity *= MAX_SPEED / speed;
  }

  var displacement = velocity * params.dt;
  let displacementLength = length(displacement);
  if (displacementLength > MAX_DISPLACEMENT) { displacement *= MAX_DISPLACEMENT / displacementLength; }
  let radius = safeRadius(particle.body.x);
  let start = position;
  position += displacement;

  for (var obstacleIndex = 0u; obstacleIndex < params.obstacleCount; obstacleIndex += 1u) {
    let resolved = resolveObstacle(start, position, velocity, radius, obstacles[obstacleIndex].rect);
    position = resolved.xy;
    velocity = resolved.zw;
  }

  let clamped = clamp(position, vec2<f32>(radius), vec2<f32>(params.worldWidth - radius, params.worldHeight - radius));
  if (clamped.x != position.x && velocity.x * (position.x - clamped.x) > 0.0) { velocity.x = 0.0; }
  if (clamped.y != position.y && velocity.y * (position.y - clamped.y) > 0.0) { velocity.y = 0.0; }
  position = clamped;

  particles[index].pos = vec4<f32>(position, velocity);
  particles[index].status.x = slowDuration(position, previousSlow);
  let excess = max(0.0, particle.state.x - max(0.0, params.crushThreshold));
  particles[index].status.z = max(0.0, previousExposure) + params.dt * max(0.0, params.crushDamage) * excess * excess;

  if (invalid && params.substepIndex == 0u) { atomicAdd(&counters[5], 1u); }
  if (params.substepIndex + 1u == params.substepCount) { atomicAdd(&counters[4], 1u); }
}
`;
