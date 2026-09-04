'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { IntegrationSettings } from './integration-settings';

type Project = { id: string; name: string; _count: { tasks: number } };
type Workspace = { role: 'OWNER' | 'ADMIN' | 'MEMBER'; workspace: { id: string; name: string; projects: Project[] } };
type Snapshot = { project: { id: string; name: string; status: string; chats: { messages: { id: string; content: string; createdAt: string }[] }[]; tasks: { id: string; title: string; status: string; updatedAt: string }[]; runs: { id: string; status: string; updatedAt: string; agent: { name: string; provider: string }; task: { title: string }; inputRequests: { id: string; question: string; status: string }[] }[]; artifacts: { id: string; title: string; mimeType: string; status: string; taskId: string; runId: string | null; reviews: { id: string; decision: string }[] }[]; notifications: { id: string; type: string; evidenceId: string }[] } };
const requestId = () => crypto.randomUUID();

function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <p role="alert">{message} {retry && <button type="button" onClick={retry}>Try again</button>}</p>;
}

export default function OfficePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<{ workspaceId: string; projectId: string }>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error' | 'offline'>('loading');
  const [notice, setNotice] = useState('');
  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) return setState('unauthorized');
      if (!response.ok) throw new Error('workspace_load_failed');
      const data = await response.json() as Workspace[];
      setWorkspaces(data);
      setSelected(previous => previous ?? data.flatMap(item => item.workspace.projects.map(project => ({ workspaceId: item.workspace.id, projectId: project.id })))[0]);
      setState('ready');
    } catch { setState(navigator.onLine ? 'error' : 'offline'); }
  }, []);
  const loadSnapshot = useCallback(async () => {
    if (!selected) return;
    try {
      const response = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/snapshot`, { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) return setState('unauthorized');
      if (!response.ok) throw new Error('snapshot_load_failed');
      setSnapshot(await response.json() as Snapshot);
    } catch { setState(navigator.onLine ? 'error' : 'offline'); }
  }, [selected]);
  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { void loadSnapshot(); const poll = window.setInterval(() => void loadSnapshot(), 2_000); return () => window.clearInterval(poll); }, [loadSnapshot]);
  useEffect(() => {
    if (!selected) return;
    const socket = io(process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001', { withCredentials: true });
    socket.on('connect', () => socket.emit('project:subscribe', selected, () => undefined));
    socket.on('office:event', () => void loadSnapshot());
    return () => { socket.close(); };
  }, [loadSnapshot, selected]);
  const currentWorkspace = useMemo(() => workspaces.find(item => item.workspace.id === selected?.workspaceId) ?? workspaces[0], [selected, workspaces]);
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentWorkspace) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const name = String(form.get('name') ?? '').trim(); if (!name) return;
    const response = await fetch(`/api/workspaces/${currentWorkspace.workspace.id}/projects`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    setNotice(response.ok ? 'Project created.' : 'Project could not be created.');
    if (response.ok) {
      const project = await response.json() as { id: string };
      formElement.reset();
      setWorkspaces(previous => previous.map(item => item.workspace.id === currentWorkspace.workspace.id ? { ...item, workspace: { ...item.workspace, projects: [...item.workspace.projects, { id: project.id, name, _count: { tasks: 0 } }] } } : item));
      setSelected({ workspaceId: currentWorkspace.workspace.id, projectId: project.id });
    }
  }
  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const content = String(form.get('content') ?? '').trim(); if (!content) return;
    const response = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/chat`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, idempotencyKey: requestId() }) });
    setNotice(response.ok ? 'Request sent; an agent run is now queued.' : 'Request could not be sent.');
    if (response.ok) { formElement.reset(); await loadSnapshot(); }
  }
  async function answerInput(event: FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault(); if (!selected) return;
    const response = String(new FormData(event.currentTarget).get('response') ?? '').trim(); if (!response) return;
    const result = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/input-requests/${requestId}/respond`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response }) });
    setNotice(result.ok ? 'Decision saved; the agent can resume.' : 'Decision could not be saved.'); if (result.ok) await loadSnapshot();
  }
  async function controlRun(runId: string, action: 'cancel' | 'retry') {
    if (!selected) return;
    const result = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/runs/${runId}/${action}`, { method: 'POST', credentials: 'include' });
    setNotice(result.ok ? `Run ${action === 'cancel' ? 'cancellation requested' : 'retry queued'}.` : `Run could not be ${action === 'cancel' ? 'cancelled' : 'retried'}.`); if (result.ok) await loadSnapshot();
  }
  async function reviewArtifact(artifactId: string, decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    if (!selected) return;
    const result = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/artifacts/${artifactId}/reviews`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
    setNotice(result.ok ? `Artifact ${decision === 'APPROVED' ? 'approved' : 'sent back for changes'}.` : 'Artifact review could not be saved.'); if (result.ok) await loadSnapshot();
  }
  async function reviseArtifact(artifactId: string) {
    if (!selected) return;
    const result = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/artifacts/${artifactId}/revise`, { method: 'POST', credentials: 'include' });
    setNotice(result.ok ? 'Artifact revision created; the prior version remains auditable.' : 'Artifact revision could not be created.'); if (result.ok) await loadSnapshot();
  }
  async function archiveProject() {
    if (!selected) return;
    const result = await fetch(`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/archive`, { method: 'POST', credentials: 'include' });
    setNotice(result.ok ? 'Project archived; history remains available.' : 'Project could not be archived.'); if (result.ok) await loadSnapshot();
  }
  if (state === 'loading') return <main><h1>AI Office</h1><p aria-live="polite">Loading your authorized project rooms…</p></main>;
  if (state === 'unauthorized') return <main><h1>Sign in required</h1><p>Your session expired or you are not authorized for this office.</p><a href="/sign-in">Sign in</a></main>;
  if (state === 'error' || state === 'offline') return <main><h1>{state === 'offline' ? 'You are offline' : 'Office unavailable'}</h1><ErrorNotice message="Project data could not be loaded." retry={() => void loadWorkspaces()} /></main>;
  return <main className="shell"><header><div><p className="eyebrow">AI OFFICE / INTERNAL</p><h1>Team control center</h1></div>{currentWorkspace && <form onSubmit={createProject}><label>New project <input name="name" required maxLength={120} /></label><button className="primary" type="submit">Create project</button></form>}</header><p aria-live="polite">{notice}</p>
    <section className="layout"><aside aria-label="Project rooms"><h2>Project rooms</h2>{workspaces.map(item => <section key={item.workspace.id}><h3>{item.workspace.name}</h3><p>{item.role.toLowerCase()} access</p>{item.workspace.projects.map(project => <button className="room" aria-pressed={selected?.projectId === project.id} key={project.id} onClick={() => setSelected({ workspaceId: item.workspace.id, projectId: project.id })}>{project.name} · {project._count.tasks} tasks</button>)}</section>)}</aside>
      <section className="content" aria-live="polite">{!selected ? <p>No active project. Create one to start an office room.</p> : !snapshot ? <p>Loading project state…</p> : <><header className="project-head"><div><p className="eyebrow">PROJECT ROOM</p><h2>{snapshot.project.name}</h2><p>{snapshot.project.status.toLowerCase()} · durable, scoped activity</p></div><div><a className="secondary" href={`/office/scene?workspace=${selected.workspaceId}&project=${selected.projectId}`}>Open 3D room</a>{currentWorkspace?.role !== 'MEMBER' && snapshot.project.status !== 'ARCHIVED' && <button type="button" onClick={() => void archiveProject()}>Archive project</button>}</div></header>
        {currentWorkspace?.role !== 'MEMBER' && <IntegrationSettings workspaceId={selected.workspaceId} projectId={selected.projectId} />}
        <section className="panel" aria-labelledby="chat-title"><h3 id="chat-title">Project chat</h3>{snapshot.project.chats[0]?.messages.length ? <ol>{snapshot.project.chats[0].messages.map(message => <li key={message.id}>{message.content} <small>{new Date(message.createdAt).toLocaleTimeString()}</small></li>)}</ol> : <p>No messages yet. Send the first agent request.</p>}<form onSubmit={sendChat}><label>Request <textarea name="content" required maxLength={2000} /></label><button className="primary" type="submit">Send to agents</button></form></section>
        <div className="grid"><section className="panel"><h3>Task board</h3>{snapshot.project.tasks.length ? snapshot.project.tasks.map(task => <article className="task" key={task.id}><div><strong>{task.title}</strong><small>{task.status.replace('_', ' ').toLowerCase()}</small></div></article>) : <p>No tasks yet.</p>}</section><section className="panel"><h3>Agent activity</h3>{snapshot.project.runs.length ? snapshot.project.runs.map(run => <article className="agent" key={run.id}><b>{run.task.title}</b><small>{run.agent.name} · {run.status.toLowerCase()} · {run.agent.provider.toLowerCase()}</small>{currentWorkspace?.role !== 'MEMBER' && ['QUEUED', 'STARTING', 'WORKING', 'WAITING_INPUT', 'BLOCKED'].includes(run.status) && <button type="button" onClick={() => void controlRun(run.id, 'cancel')}>Cancel run</button>}{currentWorkspace?.role !== 'MEMBER' && ['FAILED', 'CANCELLED'].includes(run.status) && <button type="button" onClick={() => void controlRun(run.id, 'retry')}>Retry run</button>}{run.inputRequests.filter(input => input.status === 'OPEN').map(input => <form key={input.id} onSubmit={event => void answerInput(event, input.id)}><label>{input.question}<input name="response" required /></label><button type="submit">Provide decision</button></form>)}</article>) : <p>No active agent runs.</p>}</section></div>
        <section className="panel"><h3>Artifacts</h3>{snapshot.project.artifacts.length ? <ul>{snapshot.project.artifacts.map(artifact => <li key={artifact.id}><strong>{artifact.title}</strong> · {artifact.mimeType} · {artifact.status.toLowerCase()} · <a href={`/api/workspaces/${selected.workspaceId}/projects/${selected.projectId}/artifacts/${artifact.id}`}>Inspect guarded metadata</a>{artifact.reviews[0] && <small> latest review: {artifact.reviews[0].decision.toLowerCase()}</small>}{currentWorkspace?.role !== 'MEMBER' && artifact.status !== 'SUPERSEDED' && <><button type="button" onClick={() => void reviewArtifact(artifact.id, 'APPROVED')}>Approve</button><button type="button" onClick={() => void reviewArtifact(artifact.id, 'CHANGES_REQUESTED')}>Request changes</button><button type="button" onClick={() => void reviseArtifact(artifact.id)}>Create revision</button></>}</li>)}</ul> : <p>No artifacts delivered yet.</p>}</section></>}</section>
      <aside aria-label="Attention queue"><h2>Attention</h2>{snapshot?.project.notifications.length ? <ul>{snapshot.project.notifications.map(item => <li key={item.id}>{item.type.replace('_', ' ').toLowerCase()} · evidence {item.evidenceId.slice(0, 8)}</li>)}</ul> : <p>No action is required.</p>}<p className="muted">The view refreshes from the authoritative project snapshot every two seconds.</p></aside></section></main>;
}
