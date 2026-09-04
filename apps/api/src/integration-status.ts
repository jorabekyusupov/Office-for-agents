import { access, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type IntegrationId = 'codex' | 'claude' | 'gemini';

export type IntegrationStatus = {
  id: IntegrationId;
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

const officeTargetPath = fileURLToPath(new URL('../.office-bridge-target.json', import.meta.url));
const userHome = homedir();

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function executableExists(name: string, extra: string[] = []) {
  const candidates = [
    ...extra,
    ...(process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((directory) => join(directory, name))
  ];
  return (await Promise.all(candidates.map(exists))).some(Boolean);
}

async function codexTarget() {
  try {
    return JSON.parse(await readFile(officeTargetPath, 'utf8')) as {
      workspaceId?: string;
      projectId?: string;
    };
  } catch {
    return null;
  }
}

export async function integrationStatuses(input: {
  workspaceId: string;
  projectId?: string | undefined;
  connected?: IntegrationId[] | undefined;
}): Promise<IntegrationStatus[]> {
  const [codexInstalled, claudeInstalled, geminiInstalled, codexAuth, claudeAuth, geminiAuth] =
    await Promise.all([
      executableExists('codex', ['/Applications/ChatGPT.app/Contents/Resources/codex']),
      executableExists('claude', [join(userHome, '.local/bin/claude')]),
      executableExists('gemini', [join(userHome, '.local/bin/gemini')]),
      exists(join(userHome, '.codex/auth.json')),
      Promise.all([
        exists(join(userHome, '.claude/.credentials.json')),
        exists(join(userHome, '.claude.json'))
      ]).then((values) => values.some(Boolean)),
      Promise.all([
        exists(join(userHome, '.gemini/oauth_creds.json')),
        exists(join(userHome, '.gemini/google_accounts.json'))
      ]).then((values) => values.some(Boolean))
    ]);
  const [hookConfig, hookScript, target] = await Promise.all([
    exists(join(userHome, '.codex/hooks.json')),
    exists(join(userHome, '.codex/hooks/office-bridge.mjs')),
    codexTarget()
  ]);
  const codexBridge = hookConfig && hookScript;
  const codexMapped = Boolean(
    input.projectId &&
    target?.workspaceId === input.workspaceId &&
    target.projectId === input.projectId
  );
  const anthropicApi = Boolean(process.env.ANTHROPIC_API_KEY);
  const geminiApi = Boolean(process.env.GEMINI_API_KEY);

  return [
    {
      id: 'codex',
      label: 'Codex Desktop',
      installed: codexInstalled,
      authenticated: codexAuth,
      bridgeInstalled: codexBridge,
      configured: codexInstalled && codexAuth && codexBridge,
      connected: codexInstalled && codexAuth && codexBridge && codexMapped,
      canConnect: codexInstalled && codexAuth && codexBridge && Boolean(input.projectId),
      mode: codexBridge ? 'desktop_bridge' : 'not_configured',
      detail: codexMapped
        ? 'Desktop session events are mapped to this project.'
        : codexBridge
          ? 'Ready. Connect to map new desktop sessions to this project.'
          : 'Codex Desktop hook bridge is not installed.'
    },
    {
      id: 'claude',
      label: 'Claude',
      installed: claudeInstalled,
      authenticated: claudeAuth || anthropicApi,
      bridgeInstalled: false,
      configured: anthropicApi,
      connected: anthropicApi && Boolean(input.connected?.includes('claude')),
      canConnect: anthropicApi,
      mode: anthropicApi ? 'api' : 'not_configured',
      detail: anthropicApi
        ? 'Anthropic API credential is configured on the server.'
        : claudeInstalled || claudeAuth
          ? 'Claude CLI was detected, but its AI Office lifecycle bridge is not installed yet.'
          : 'Install Claude CLI or configure ANTHROPIC_API_KEY on the server.'
    },
    {
      id: 'gemini',
      label: 'Gemini',
      installed: geminiInstalled,
      authenticated: geminiAuth || geminiApi,
      bridgeInstalled: false,
      configured: geminiApi,
      connected: geminiApi && Boolean(input.connected?.includes('gemini')),
      canConnect: geminiApi,
      mode: geminiApi ? 'api' : 'not_configured',
      detail: geminiApi
        ? 'Gemini API credential is configured on the server.'
        : geminiInstalled || geminiAuth
          ? 'Gemini CLI was detected, but its AI Office lifecycle bridge is not installed yet.'
          : 'Install Gemini CLI or configure GEMINI_API_KEY on the server.'
    }
  ];
}

export async function connectCodexTarget(input: { workspaceId: string; projectId: string }) {
  await writeFile(
    officeTargetPath,
    `${JSON.stringify({ ...input, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 }
  );
}
