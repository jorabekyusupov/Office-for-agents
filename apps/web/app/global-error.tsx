'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => { console.error('AI Office unrecoverable error', error); }, [error]);

  return <html lang="en"><body><main className="app-error-page" role="alert"><p>AI OFFICE / RECOVERY MODE</p><h1>The office needs to restart its view.</h1><span>Your projects and agent runs are still stored safely.</span><div><button type="button" onClick={reset}>Try again</button><a href="/office">Open control center</a></div></main></body></html>;
}
