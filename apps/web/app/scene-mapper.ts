import {
  behaviorForRun,
  isReadyArtifact,
  stableSceneSlots,
  toolHintFor,
  type SceneArtifact,
  type SceneOccupant,
  type SceneRun
} from './room-semantics';

export type { SceneOccupant } from './room-semantics';

const colorFor = (provider: string) =>
  provider === 'OPENAI'
    ? '#62a8ff'
    : provider === 'ANTHROPIC'
      ? '#f1bf64'
      : provider === 'GOOGLE'
        ? '#a87cff'
        : '#5fd6a5';
const activityFor = (run: SceneRun, tool: string) => {
  if (tool.includes('terminal') || tool.includes('exec_command'))
    return 'Terminal buyruqlarini bajarmoqda';
  if (tool.includes('apply_patch')) return 'Kod fayllarini yangilamoqda';
  if (tool.includes('web')) return 'Webda izlanmoqda';
  if (tool.includes('image')) return 'Vizual yaratmoqda';
  return run.status === 'WORKING'
    ? 'Vazifa ustida ishlayapti'
    : run.status === 'STARTING'
      ? 'Ishni boshlamoqda'
      : run.status.toLowerCase();
};

export function mapRunsToSceneOccupants(
  runs: readonly SceneRun[],
  artifacts: readonly SceneArtifact[] = []
): SceneOccupant[] {
  const slots = stableSceneSlots(runs);
  const readyArtifactsByRun = new Set(
    artifacts
      .filter(isReadyArtifact)
      .flatMap((artifact) => (artifact.runId ? [artifact.runId] : []))
  );
  return runs.map((run) => {
    const toolHint = toolHintFor(run.task.events);
    const hasReadyArtifact = readyArtifactsByRun.has(run.id);
    return {
      id: run.id,
      name: run.task.title,
      agentName: run.agent.name,
      activity: activityFor(run, toolHint),
      status: run.status,
      color: colorFor(run.agent.provider),
      anchor: slots[run.id] ?? 0,
      hasReadyArtifact,
      ...behaviorForRun(run.status, toolHint, hasReadyArtifact)
    };
  });
}
