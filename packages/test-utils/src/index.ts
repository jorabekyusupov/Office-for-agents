export function createCorrelationId(): string {
  return crypto.randomUUID();
}
