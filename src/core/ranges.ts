export function parsePageRange(value: string, count: number): number[] {
  const pages = new Set<number>();
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, like 1, 3-5.');
    const first = Number(match[1]); const last = Number(match[2] ?? match[1]);
    if (first < 1 || last > count || last < first) throw new Error(`Enter pages between 1 and ${count}.`);
    for (let i = first; i <= last; i++) pages.add(i - 1);
  }
  return [...pages];
}
