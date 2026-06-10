import { PHYSICS, CUBE, JUMPER } from './constants.js';

export class Physics {
  static jumpTrajectory(pos, velX, velY, dir) {
    if (dir === 'left') pos.x -= velX;
    else                pos.z -= velX;
    pos.y += velY;
    return { pos, velY: velY - PHYSICS.gravity };
  }

  /**
   * Landing check. Only checks cubes reachable on the current movement axis.
   * Stops scanning when the path turns (axis changes), preventing false positives
   * from distant cubes that happen to share the same coordinate.
   */
  static checkLanding(jumperX, jumperZ, cubes, dirs, currentIdx) {
    const safeRadius = CUBE.width / 2;
    const moveDir = dirs[currentIdx] || 'left';
    const moveAxis = moveDir === 'left' ? 'x' : 'z';
    const jumperVal = moveAxis === 'x' ? jumperX : jumperZ;

    // Scan forward: only cubes on the same movement axis
    let steps = 0;
    for (let i = currentIdx + 1; i < cubes.length; i++) {
      const cubeDir = dirs[i - 1] || 'left';
      const cubeAxis = cubeDir === 'left' ? 'x' : 'z';
      if (cubeAxis !== moveAxis) break; // path turned — stop
      steps++;
      const cubeVal = cubes[i].position[moveAxis];
      const dist = Math.abs(jumperVal - cubeVal);
      if (dist < safeRadius) return { location: steps, distance: dist };
    }

    // Fell back on current cube
    const curVal = cubes[currentIdx].position[moveAxis];
    const dist = Math.abs(jumperVal - curVal);
    if (dist < safeRadius) return { location: -1, distance: dist };

    return { location: 0, distance: Infinity };
  }
}
