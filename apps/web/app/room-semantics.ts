export type RoomAnchor =
  | 'arrival'
  | 'desk'
  | 'research_board'
  | 'review_station'
  | 'waiting_area'
  | 'help_beacon'
  | 'delivery_shelf';
export type RoomPose =
  | 'walking'
  | 'typing'
  | 'researching'
  | 'reviewing'
  | 'waiting'
  | 'alert'
  | 'acknowledging'
  | 'idle';
export type RoomTransition = 'enter' | 'move' | 'hold' | 'acknowledge';

export type SceneOccupant = {
  id: string;
  name: string;
  agentName: string;
  activity: string;
  status: string;
  color: string;
  anchor: number;
  roomAnchor: RoomAnchor;
  pose: RoomPose;
  transition: RoomTransition;
  hasReadyArtifact: boolean;
};

export type SceneEvent = { payload: unknown };
export type SceneRun = {
  id: string;
  status: string;
  agent: { name: string; provider: string };
  task: { title: string; events?: SceneEvent[] };
};
export type SceneArtifact = { runId?: string | null; status: string };

export type RoomBehavior = Pick<SceneOccupant, 'roomAnchor' | 'pose' | 'transition'>;

const canonicalStatus = (status: string) => status.trim().toUpperCase();

export function isReadyArtifact(artifact: SceneArtifact) {
  return ['READY', 'APPROVED'].includes(canonicalStatus(artifact.status));
}

export function toolHintFor(events: readonly SceneEvent[] | undefined) {
  const payload = events?.[0]?.payload;
  if (!payload || typeof payload !== 'object') return '';
  const candidate = payload as { toolName?: unknown; eventName?: unknown };
  return [candidate.toolName, candidate.eventName]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export function behaviorForRun(
  status: string,
  toolHint: string,
  hasReadyArtifact: boolean
): RoomBehavior {
  switch (canonicalStatus(status)) {
    case 'STARTING':
      return { roomAnchor: 'arrival', pose: 'walking', transition: 'enter' };
    case 'WORKING':
      if (toolHint.includes('web') || toolHint.includes('search') || toolHint.includes('research'))
        return { roomAnchor: 'research_board', pose: 'researching', transition: 'move' };
      if (toolHint.includes('review') || toolHint.includes('approve'))
        return { roomAnchor: 'review_station', pose: 'reviewing', transition: 'move' };
      return { roomAnchor: 'desk', pose: 'typing', transition: 'move' };
    case 'WAITING':
    case 'WAITING_INPUT':
      return { roomAnchor: 'waiting_area', pose: 'waiting', transition: 'hold' };
    case 'BLOCKED':
    case 'FAILED':
    case 'CANCELLED':
      return { roomAnchor: 'help_beacon', pose: 'alert', transition: 'hold' };
    case 'COMPLETED':
      return hasReadyArtifact
        ? { roomAnchor: 'delivery_shelf', pose: 'acknowledging', transition: 'acknowledge' }
        : { roomAnchor: 'desk', pose: 'acknowledging', transition: 'acknowledge' };
    default:
      return { roomAnchor: 'desk', pose: 'idle', transition: 'hold' };
  }
}

export function stableSceneSlots(runs: readonly SceneRun[]) {
  return [...new Set(runs.map((run) => run.id))]
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, number>>((slots, id, index) => {
      slots[id] = index;
      return slots;
    }, {});
}
