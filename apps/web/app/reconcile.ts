import type { OfficeEvent } from '@ai-office/contracts';

export type ReconcileResult = { kind: 'applied' | 'duplicate' | 'recover'; nextSequence: number };
export function reconcileEvent(lastSequence: number, event: OfficeEvent): ReconcileResult {
  if (event.schemaVersion !== 1 || event.sequence > lastSequence + 1) return { kind: 'recover', nextSequence: lastSequence };
  if (event.sequence <= lastSequence) return { kind: 'duplicate', nextSequence: lastSequence };
  return { kind: 'applied', nextSequence: event.sequence };
}
