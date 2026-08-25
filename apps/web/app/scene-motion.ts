import type { RoomAnchor, SceneOccupant } from './room-semantics';

export type ScenePoint = readonly [number, number, number];

const deskAnchors: readonly ScenePoint[] = [
  [-5.4, 0.47, -1.92],
  [-2.7, 0.47, -1.92],
  [0, 0.47, -1.92],
  [2.7, 0.47, -1.92],
  [5.4, 0.47, -1.92],
  [-4.05, 0.47, 1.02],
  [-1.35, 0.47, 1.02],
  [1.35, 0.47, 1.02],
  [4.05, 0.47, 1.02]
];
const zoneOrigins: Record<Exclude<RoomAnchor, 'desk' | 'arrival'>, ScenePoint> = {
  research_board: [-5.65, 0.47, -4.7],
  review_station: [-1.5, 0.47, 3.8],
  waiting_area: [4.8, 0.47, 2.2],
  help_beacon: [6.25, 0.47, 4.9],
  delivery_shelf: [6.9, 0.47, -5.15]
};
const entrance: ScenePoint = [-8.1, 0.47, -5.45];
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
  return deskAnchors[slot % deskAnchors.length] ?? deskAnchors[0] ?? [0, 0.47, 0];
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

export function shouldAnimateArrival(occupant: Pick<SceneOccupant, 'transition'>) {
  return occupant.transition === 'enter';
}
