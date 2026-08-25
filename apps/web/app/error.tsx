'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => { console.error('AI Office route error', error); }, [error]);

  return <main className="app-error-page" role="alert">
    <p>AI OFFICE / RECOVERY MODE</p>
    <h1>This room could not be rendered.</h1>
    <span>The live project data remains safe. Try the room again, or continue in the 2D control center.</span>
    <div><button type="button" onClick={reset}>Try room again</button><a href="/office">Open control center</a></div>
  </main>;
}
