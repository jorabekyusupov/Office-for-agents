'use client';

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';
import type { OfficeEvent } from '@ai-office/contracts';
import { OfficeScene, type RoomArtifact } from '../../office-scene';
import { mapRunsToSceneOccupants, type SceneOccupant } from '../../scene-mapper';
import { reconcileEvent } from '../../reconcile';

type TimelineEvent = { type: string; occurredAt: string; payload: unknown };
type Snapshot = {
  project: {
    name: string;
    room: { layoutVersion: number } | null;
    runs: {
      id: string;
      status: string;
      updatedAt: string;
      agent: { name: string; provider: string };
      task: { title: string; events?: TimelineEvent[] };
    }[];
    artifacts: { id: string; title: string; status: string; runId?: string | null }[];
  };
};
function milestoneFor(event: TimelineEvent) {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as { eventName?: unknown; toolName?: unknown })
      : undefined;
  const value =
    typeof payload?.eventName === 'string'
      ? payload.eventName
      : typeof payload?.toolName === 'string'
        ? payload.toolName
        : event.type;
  return value.replace(/[._-]+/g, ' ').slice(0, 96);
}

function SceneRoom() {
  const params = useSearchParams();
  const workspaceId = params.get('workspace');
  const projectId = params.get('project');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [selectedAgent, setSelectedAgent] = useState<SceneOccupant>();
  const [selectedArtifact, setSelectedArtifact] = useState<RoomArtifact>();
  const [prompt, setPrompt] = useState('');
  const lastSequence = useRef(0);
  const hasSnapshot = useRef(false);
  const previousRunStatuses = useRef(new Map<string, string>());
  const departingRunIds = useRef(new Set<string>());

  const loadSnapshot = useCallback(async () => {
    if (!workspaceId || !projectId) {
      setState('error');
      return;
    }
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/snapshot`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!response.ok) throw new Error('snapshot_unavailable');
      setSnapshot((await response.json()) as Snapshot);
      hasSnapshot.current = true;
      setState('ready');
    } catch {
      if (!hasSnapshot.current) setState('error');
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void loadSnapshot();
    const poll = window.setInterval(() => void loadSnapshot(), 12_000);
    return () => window.clearInterval(poll);
  }, [loadSnapshot]);

  useEffect(() => {
    if (!workspaceId || !projectId) return;
    const socket = io(process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001', {
      withCredentials: true,
      reconnection: true
    });
    socket.on('connect', () => {
      socket.emit(
        'project:subscribe',
        { workspaceId, projectId, afterSequence: lastSequence.current },
        (response: unknown) => {
          const result = response as { snapshot?: Snapshot; error?: string };
          if (result.snapshot) {
            setSnapshot(result.snapshot);
            setState('ready');
          }
        }
      );
    });
    socket.on('office:event', (event: OfficeEvent) => {
      const result = reconcileEvent(lastSequence.current, event);
      if (result.kind === 'duplicate') return;
      lastSequence.current = result.nextSequence;
      void loadSnapshot();
    });
    return () => {
      socket.close();
    };
  }, [loadSnapshot, projectId, workspaceId]);

  useEffect(() => {
    if (!snapshot) return;
    previousRunStatuses.current = new Map(snapshot.project.runs.map((run) => [run.id, run.status]));
  }, [snapshot]);

  if (state === 'loading')
    return (
      <main className="scene-page scene-state">
        <p className="scene-kicker">AI OFFICE / ROOM</p>
        <h1>Loading project room…</h1>
        <p>Syncing the authoritative project state.</p>
      </main>
    );
  if (state === 'error' || !snapshot)
    return (
      <main className="scene-page scene-state">
        <a className="scene-back" href="/office">
          ← Back to control center
        </a>
        <p className="scene-kicker">AI OFFICE / ROOM</p>
        <h1>Room data is unavailable</h1>
        <p>Use the 2D control center to continue the project workflow.</p>
        <button type="button" onClick={() => void loadSnapshot()}>
          Retry room sync
        </button>
      </main>
    );

  const artifacts: RoomArtifact[] = snapshot.project.artifacts;
  const activeStatuses = new Set([
    'QUEUED',
    'STARTING',
    'WORKING',
    'WAITING',
    'WAITING_INPUT',
    'BLOCKED',
    'FAILED'
  ]);
  const terminalStatuses = new Set(['COMPLETED', 'CANCELLED']);
  for (const run of snapshot.project.runs) {
    const previousStatus = previousRunStatuses.current.get(run.id);
    if (
      terminalStatuses.has(run.status) &&
      previousStatus !== undefined &&
      activeStatuses.has(previousStatus)
    ) {
      departingRunIds.current.add(run.id);
    } else if (activeStatuses.has(run.status)) {
      departingRunIds.current.delete(run.id);
    }
  }
  const visibleRuns = snapshot.project.runs.filter(
    (run) => activeStatuses.has(run.status) || departingRunIds.current.has(run.id)
  );
  const occupants: SceneOccupant[] = mapRunsToSceneOccupants(visibleRuns, artifacts).map(
    (occupant) =>
      activeStatuses.has(occupant.status) && !previousRunStatuses.current.has(occupant.id)
        ? { ...occupant, pose: 'walking' as const, transition: 'enter' as const }
        : occupant
  );
  const selectedRun = snapshot.project.runs.find((run) => run.id === selectedAgent?.id);

  async function dispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || !workspaceId || !projectId) return;
    const response = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() })
    });
    if (response.ok) {
      setPrompt('');
      await loadSnapshot();
    }
  }

  return (
    <main className="scene-page scene-simulator-page">
      <div className="scene-simulator-shell">
        <OfficeScene
          occupants={occupants}
          artifacts={artifacts}
          onSelectAgent={setSelectedAgent}
          onSelectArtifact={setSelectedArtifact}
        />
        <aside className="sim-telemetry" aria-label="Live agent telemetry">
          <b>
            <i /> LIVE AGENT TELEMETRY
          </b>
          {occupants.length ? (
            occupants.slice(0, 6).map((occupant) => (
              <button type="button" key={occupant.id} onClick={() => setSelectedAgent(occupant)}>
                <span style={{ background: occupant.color }} />
                {occupant.agentName}
                <small>{occupant.activity}</small>
              </button>
            ))
          ) : (
            <p>Hali real agent run yo‘q.</p>
          )}
        </aside>
        {selectedAgent && (
          <aside className="sim-inspector" aria-label="Selected agent inspector">
            <button className="sim-close" type="button" onClick={() => setSelectedAgent(undefined)}>
              ×
            </button>
            <p>AGENT INSPECTOR</p>
            <h2>{selectedAgent.agentName}</h2>
            <span className="sim-status">{selectedAgent.status.replace('_', ' ')}</span>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{selectedRun?.agent.provider.toLowerCase() ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Current work</dt>
                <dd>{selectedAgent.name}</dd>
              </div>
              <div>
                <dt>Activity</dt>
                <dd>{selectedAgent.activity}</dd>
              </div>
              <div>
                <dt>Room behavior</dt>
                <dd>
                  {selectedAgent.roomAnchor.replace('_', ' ')} · {selectedAgent.pose}
                </dd>
              </div>
              <div>
                <dt>Safe milestones</dt>
                <dd>
                  {selectedRun?.task.events?.length
                    ? selectedRun.task.events.map(milestoneFor).join(' · ')
                    : 'No reported milestone yet.'}
                </dd>
              </div>
            </dl>
            <form onSubmit={dispatch}>
              <label>
                Project follow-up
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={2_000}
                  placeholder="Agentga keyingi ko‘rsatma…"
                />
              </label>
              <button type="submit">Send to project</button>
            </form>
            <a className="sim-inspector-link" href="/office">
              Open permitted 2D controls →
            </a>
          </aside>
        )}
        {selectedArtifact && (
          <aside className="sim-artifact-inspector" aria-label="Selected artifact inspector">
            <button
              className="sim-close"
              type="button"
              onClick={() => setSelectedArtifact(undefined)}
            >
              ×
            </button>
            <p>DELIVERY SHELF</p>
            <h2>{selectedArtifact.title}</h2>
            <span className="sim-status">{selectedArtifact.status.toLowerCase()}</span>
            <p>Produced by run {selectedArtifact.runId?.slice(0, 8) ?? 'not linked'}</p>
            <a
              href={`/api/workspaces/${workspaceId}/projects/${projectId}/artifacts/${selectedArtifact.id}`}
            >
              Inspect guarded artifact metadata →
            </a>
          </aside>
        )}
      </div>
    </main>
  );
}

export default function ScenePage() {
  return (
    <Suspense
      fallback={
        <main className="scene-page scene-state">
          <p className="scene-kicker">AI OFFICE / ROOM</p>
          <h1>Loading project room…</h1>
        </main>
      }
    >
      <SceneRoom />
    </Suspense>
  );
}
