import type { RoomAnchor, SceneOccupant } from './room-semantics';

export type ScenePoint = readonly [number, number, number];

export const visibleDeskCapacity = 20;
export const maximumDeskCapacity = 50;

const deskColumns = 10;
const deskColumnGap = 2.55;
const deskRowGap = 3;

export function deskLayoutFor(slot: number): {
  position: readonly [number, number];
  rotation: number;
} {
  const normalizedSlot = Math.abs(slot) % maximumDeskCapacity;
  const column = normalizedSlot % deskColumns;
  const row = Math.floor(normalizedSlot / deskColumns);
  return {
    position: [(column - (deskColumns - 1) / 2) * deskColumnGap, -6.8 + row * deskRowGap],
    rotation: 0
  };
}
const zoneOrigins: Record<Exclude<RoomAnchor, 'desk' | 'arrival'>, ScenePoint> = {
  research_board: [-11.6, 0.47, -7.7],
  review_station: [-2.2, 0.47, 7.8],
  waiting_area: [10.4, 0.47, -3.1],
  help_beacon: [11.2, 0.47, 7.2],
  delivery_shelf: [11.7, 0.47, -8]
};
const entrance: ScenePoint = [-16.2, 0.47, -7.8];
const doorway: ScenePoint = [-13.8, 0.47, -7.8];
const laneOffsets: readonly ScenePoint[] = [
  [0, 0, 0],
  [0.68, 0, 0],
  [-0.68, 0, 0],
  [0, 0, 0.64],
  [0, 0, -0.64],
  [1.28, 0, 0],
  [-1.28, 0, 0]
];

const offsetPoint = (origin: ScenePoint, slot: number): ScenePoint => {
  const offset = laneOffsets[slot % laneOffsets.length] ?? laneOffsets[0] ?? [0, 0, 0];
  return [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
};

export function deskPoint(slot: number): ScenePoint {
  const desk = deskLayoutFor(slot);
  return [desk.position[0], 0.47, desk.position[1] + 0.63];
}

export function targetPointFor(occupant: Pick<SceneOccupant, 'anchor' | 'roomAnchor'>): ScenePoint {
  if (occupant.roomAnchor === 'desk' || occupant.roomAnchor === 'arrival')
    return deskPoint(occupant.anchor);
  return offsetPoint(zoneOrigins[occupant.roomAnchor], occupant.anchor);
}

export function initialPointFor(
  occupant: Pick<SceneOccupant, 'anchor' | 'roomAnchor' | 'transition'>
): ScenePoint {
  return occupant.transition === 'enter'
    ? offsetPoint(entrance, occupant.anchor)
    : targetPointFor(occupant);
}

export function motionWaypointsFor(
  occupant: Pick<SceneOccupant, 'anchor' | 'roomAnchor' | 'transition'>
): ScenePoint[] {
  const operationalTarget = targetPointFor(occupant);
  if (occupant.transition === 'enter') {
    return [
      offsetPoint(entrance, occupant.anchor),
      offsetPoint(doorway, occupant.anchor),
      operationalTarget
    ];
  }
  if (occupant.transition === 'exit') {
    return [offsetPoint(doorway, occupant.anchor), offsetPoint(entrance, occupant.anchor)];
  }
  return [operationalTarget];
}

export function shouldAnimateArrival(occupant: Pick<SceneOccupant, 'transition'>) {
  return occupant.transition === 'enter';
}

export function shouldAnimateDeparture(occupant: Pick<SceneOccupant, 'transition'>) {
  return occupant.transition === 'exit';
}
