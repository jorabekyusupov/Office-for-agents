const counters = new Map<string, number>();

export function incrementMetric(name: string) {
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

export function metricsSnapshot() {
  return Object.fromEntries([...counters.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
