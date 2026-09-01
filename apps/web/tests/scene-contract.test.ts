import { describe, expect, it } from 'vitest';
import { mapRunsToSceneOccupants } from '../app/scene-mapper.js';
import { initialPointFor, targetPointFor } from '../app/scene-motion.js';
import { defaultGraphicsQuality, graphicsProfileFor } from '../app/scene-quality.js';

describe('scene contract', () => {
  it('keeps 3D occupants derived from authoritative run state', () => {
    expect(
      mapRunsToSceneOccupants([
        {
          id: 'run-1',
          status: 'WORKING',
          agent: { name: 'Codex', provider: 'OPENAI' },
          task: { title: 'Codex · project-a · abc123' }
        }
      ])
    ).toEqual([
      {
        id: 'run-1',
        name: 'Codex · project-a · abc123',
        agentName: 'Codex',
        activity: 'Vazifa ustida ishlayapti',
        status: 'WORKING',
        color: '#62a8ff',
        anchor: 0,
        roomAnchor: 'desk',
        pose: 'typing',
        transition: 'move',
        hasReadyArtifact: false
      }
    ]);
  });

  it('maps every canonical status to a stable, non-synthetic room behavior', () => {
    const statuses = [
      'STARTING',
      'WORKING',
      'WAITING',
      'WAITING_INPUT',
      'BLOCKED',
      'FAILED',
      'CANCELLED',
      'COMPLETED'
    ];
    const occupants = mapRunsToSceneOccupants(
      statuses.map((status, index) => ({
        id: `run-${index}`,
        status,
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: status }
      }))
    );
    expect(
      occupants.map((occupant) => [occupant.status, occupant.roomAnchor, occupant.pose])
    ).toEqual([
      ['STARTING', 'arrival', 'walking'],
      ['WORKING', 'desk', 'typing'],
      ['WAITING', 'waiting_area', 'waiting'],
      ['WAITING_INPUT', 'waiting_area', 'waiting'],
      ['BLOCKED', 'help_beacon', 'alert'],
      ['FAILED', 'help_beacon', 'alert'],
      ['CANCELLED', 'help_beacon', 'alert'],
      ['COMPLETED', 'desk', 'acknowledging']
    ]);
  });

  it('uses safe tool hints only for the working sub-anchor', () => {
    const runs = [
      {
        id: 'web',
        status: 'WORKING',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Research', events: [{ payload: { toolName: 'web.run' } }] }
      },
      {
        id: 'review',
        status: 'WORKING',
        agent: { name: 'Claude', provider: 'ANTHROPIC' },
        task: { title: 'Review', events: [{ payload: { eventName: 'review_requested' } }] }
      },
      {
        id: 'unknown',
        status: 'UNRECOGNIZED',
        agent: { name: 'Gemini', provider: 'GOOGLE' },
        task: { title: 'Unknown', events: [{ payload: 'bad payload' }] }
      }
    ];
    const occupants = mapRunsToSceneOccupants(runs);
    expect(occupants.map((occupant) => [occupant.id, occupant.roomAnchor, occupant.pose])).toEqual([
      ['web', 'research_board', 'researching'],
      ['review', 'review_station', 'reviewing'],
      ['unknown', 'desk', 'idle']
    ]);
  });

  it('assigns deterministic slots regardless of snapshot order', () => {
    const runs = ['c', 'a', 'b'].map((id) => ({
      id,
      status: 'WORKING',
      agent: { name: id, provider: 'OPENAI' },
      task: { title: id }
    }));
    const slots = new Map(
      mapRunsToSceneOccupants(runs).map((occupant) => [occupant.id, occupant.anchor])
    );
    expect(
      mapRunsToSceneOccupants([...runs].reverse()).map((occupant) => [occupant.id, occupant.anchor])
    ).toEqual([
      ['b', slots.get('b')],
      ['a', slots.get('a')],
      ['c', slots.get('c')]
    ]);
  });

  it('shows the delivery shelf only for a completed run with a real ready artifact', () => {
    const runs = [
      {
        id: 'done',
        status: 'COMPLETED',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Deliver' }
      }
    ];
    expect(mapRunsToSceneOccupants(runs)[0]?.roomAnchor).toBe('desk');
    expect(mapRunsToSceneOccupants(runs, [{ runId: 'done', status: 'READY' }])[0]).toMatchObject({
      roomAnchor: 'delivery_shelf',
      hasReadyArtifact: true
    });
  });

  it('has deterministic behavior for empty and duplicate inputs', () => {
    expect(mapRunsToSceneOccupants([])).toEqual([]);
    const duplicate = {
      id: 'same',
      status: 'WORKING',
      agent: { name: 'Codex', provider: 'OPENAI' },
      task: { title: 'Same' }
    };
    expect(
      mapRunsToSceneOccupants([duplicate, duplicate]).map((occupant) => occupant.anchor)
    ).toEqual([0, 0]);
  });

  it('gives starting runs a separate entry point and every live target a collision-free desk slot', () => {
    const starting = mapRunsToSceneOccupants([
      {
        id: 'start',
        status: 'STARTING',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Start' }
      }
    ])[0];
    expect(starting).toBeDefined();
    expect(initialPointFor(starting!)).not.toEqual(targetPointFor(starting!));
    const active = mapRunsToSceneOccupants(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => ({
        id,
        status: 'WORKING',
        agent: { name: id, provider: 'OPENAI' },
        task: { title: id }
      }))
    );
    expect(new Set(active.map(targetPointFor).map((point) => point.join(':'))).size).toBe(
      active.length
    );
  });

  it('uses the authoritative target on refresh and derives a new target when status changes', () => {
    const working = mapRunsToSceneOccupants([
      {
        id: 'run',
        status: 'WORKING',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Research', events: [{ payload: { toolName: 'web.run' } }] }
      }
    ])[0]!;
    const waiting = mapRunsToSceneOccupants([
      {
        id: 'run',
        status: 'WAITING',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Research' }
      }
    ])[0]!;
    expect(initialPointFor(working)).toEqual(targetPointFor(working));
    expect(targetPointFor(working)).not.toEqual(targetPointFor(waiting));
  });

  it('uses bounded graphics profiles and a low-motion default', () => {
    expect(graphicsProfileFor('high')).toMatchObject({ dpr: [1, 2], shadows: true, effects: true });
    expect(graphicsProfileFor('balanced')).toMatchObject({
      dpr: [1, 1.5],
      shadows: true,
      effects: false
    });
    expect(graphicsProfileFor('low')).toMatchObject({
      dpr: [1, 1],
      shadows: false,
      antialias: false,
      effects: false
    });
    expect(defaultGraphicsQuality(true)).toBe('low');
  });

  it('maps tool activity hints accurately to human-readable activities', () => {
    const terminalRun = mapRunsToSceneOccupants([
      {
        id: 'term',
        status: 'WORKING',
        agent: { name: 'Codex', provider: 'OPENAI' },
        task: { title: 'Run bash', events: [{ payload: { toolName: 'exec_command' } }] }
      }
    ])[0]!;
    expect(terminalRun.activity).toBe('Terminal buyruqlarini bajarmoqda');

    const patchRun = mapRunsToSceneOccupants([
      {
        id: 'patch',
        status: 'WORKING',
        agent: { name: 'Claude', provider: 'ANTHROPIC' },
        task: { title: 'Edit code', events: [{ payload: { toolName: 'apply_patch' } }] }
      }
    ])[0]!;
    expect(patchRun.activity).toBe('Kod fayllarini yangilamoqda');

    const imageRun = mapRunsToSceneOccupants([
      {
        id: 'img',
        status: 'WORKING',
        agent: { name: 'Gemini', provider: 'GOOGLE' },
        task: { title: 'Generate asset', events: [{ payload: { toolName: 'generate_image' } }] }
      }
    ])[0]!;
    expect(imageRun.activity).toBe('Vizual yaratmoqda');
  });
});

