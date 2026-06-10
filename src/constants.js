// All tunable game parameters in one place.
// Tweak these to adjust feel, difficulty, and visuals.

export const COLORS = {
  background: 0x888888,
  cube: 0xffffff,
  jumper: 0x232323,
  ambientLight: 0xffffff,
  directionalLight: 0xffffff,
};

export const CUBE = {
  width: 4,
  height: 2,
  depth: 4,
  minGap: 6,   // at this gap, the jumper barely fits between cube edges (edge gap ≈ 2 > jumper width 1.4)
  maxGap: 12,
  maxVisible: 9, // keep enough cubes for 2 behind + current + 3 ahead + spare
};

export const JUMPER = {
  width: 1.4,
  height: 2,
  depth: 1,
  startY: 1,
};

export const PHYSICS = {
  chargeSpeed: 0.002,   // power accumulated per frame  (×0.25 baseline)
  jumpSpeedX: 0.03,     // horizontal speed multiplier
  jumpSpeedY: 0.085,    // +25%
  gravity: 0.00375,     // +25%
  compressSpeed: 0.0056, // +25%
  releaseSpeed: 0.103,   // +25%
  fallSpeed: 0.103,      // +25%
  rotateSpeed: 0.08,    // rotation speed (unchanged)
};

export const CAMERA = {
  smoothSpeed: 0.06,         // lerp factor for camera follow
  frustumSize: 22,            // tighter view
  offset: { x: 10, y: 10, z: 10 },
};

export const LIGHTING = {
  // Multiply by PI to compensate for physically correct lights in modern Three.js.
  // Old r92 did NOT divide by PI in the BRDF; r170 always does.
  // r92 ambient=0.3  →  0.3 * PI ≈ 0.94
  // r92 directional=1.1 → 1.1 * PI ≈ 3.46
  ambientIntensity: 0.94,
  directionalIntensity: 3.46,
};

export const GROUND_Y = -1;

export const GAME_STATES = {
  IDLE: 'idle',
  CHARGING: 'charging',
  JUMPING: 'jumping',
  LANDING: 'landing',
  FALLING: 'falling',
  TRANSITIONING: 'transitioning',
  GAMEOVER: 'gameover',
};
