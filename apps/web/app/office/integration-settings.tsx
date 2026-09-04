'use client';

import { useCallback, useEffect, useState } from 'react';

type Integration = {
  id: 'codex' | 'claude' | 'gemini';
  label: string;
  installed: boolean;
  authenticated: boolean;
  bridgeInstalled: boolean;
  configured: boolean;
  connected: boolean;
  canConnect: boolean;
  mode: 'desktop_bridge' | 'api' | 'not_configured';
  detail: string;
};

export function IntegrationSettings({
  workspaceId,
  projectId
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [connecting, setConnecting] = useState<Integration['id']>();
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/integrations?projectId=${encodeURIComponent(projectId)}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!response.ok) throw new Error('integration_status_failed');
      const result = (await response.json()) as { integrations: Integration[] };
      setIntegrations(result.integrations);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect(integration: Integration) {
    setConnecting(integration.id);
    setNotice('');
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/integrations/${integration.id}/connect`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId })
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setNotice(
          result.error === 'integration_not_configured'
            ? `${integration.label} hali serverda to‘liq sozlanmagan.`
            : `${integration.label} ulanmagan. Qayta urinib ko‘ring.`
        );
        return;
      }
      setNotice(`${integration.label} ushbu projectga muvaffaqiyatli bog‘landi.`);
      await refresh();
    } catch {
      setNotice(`${integration.label} bilan aloqa vaqtida xatolik yuz berdi.`);
    } finally {
      setConnecting(undefined);
    }
  }

  return (
    <section className="panel integrations-panel" aria-labelledby="integrations-title">
      <div className="integrations-heading">
        <div>
          <p className="eyebrow">AUTOMATIC CONNECTION</p>
          <h3 id="integrations-title">AI tool sozlamalari</h3>
          <p>Lokal CLI, login va bridge holati avtomatik, tokenlarni ko‘rsatmasdan tekshiriladi.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={state === 'loading'}>
          {state === 'loading' ? 'Tekshirilmoqda…' : 'Qayta tekshirish'}
        </button>
      </div>

      {state === 'error' ? (
        <p role="alert">
          Integratsiya holatini olib bo‘lmadi.{' '}
          <button type="button" onClick={() => void refresh()}>
            Qayta urinish
          </button>
        </p>
      ) : (
        <div className="integration-grid" aria-busy={state === 'loading'}>
          {integrations.map((integration) => (
            <article className="integration-card" key={integration.id}>
              <div className="integration-card-head">
                <span
                  className={`integration-logo integration-logo-${integration.id}`}
                  aria-hidden="true"
                >
                  {integration.label.slice(0, 1)}
                </span>
                <div>
                  <strong>{integration.label}</strong>
                  <span className={`integration-state ${integration.connected ? 'connected' : ''}`}>
                    {integration.connected
                      ? 'Bog‘langan'
                      : integration.configured
                        ? 'Tayyor'
                        : 'Sozlash kerak'}
                  </span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Ilova</dt>
                  <dd>{integration.installed ? 'Topildi' : 'Topilmadi'}</dd>
                </div>
                <div>
                  <dt>Login</dt>
                  <dd>{integration.authenticated ? 'Mavjud' : 'Mavjud emas'}</dd>
                </div>
                <div>
                  <dt>Bridge</dt>
                  <dd>
                    {integration.bridgeInstalled
                      ? 'Faol'
                      : integration.mode === 'api'
                        ? 'API'
                        : 'Yo‘q'}
                  </dd>
                </div>
              </dl>
              <p>{integration.detail}</p>
              <button
                className="integration-connect"
                type="button"
                disabled={
                  !integration.canConnect || integration.connected || connecting === integration.id
                }
                onClick={() => void connect(integration)}
              >
                {connecting === integration.id
                  ? 'Bog‘lanmoqda…'
                  : integration.connected
                    ? 'Bog‘langan'
                    : 'Projectga bog‘lash'}
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="integration-notice" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
