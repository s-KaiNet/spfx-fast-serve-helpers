const CODE_FRAME_CONTEXT_LINES = 2;

export function codeFrame(source: string, line: number, column?: number): string[] {
  const sourceLines = source.split(/\r?\n/);
  const first = Math.max(1, line - CODE_FRAME_CONTEXT_LINES);
  const last = Math.min(sourceLines.length, line + CODE_FRAME_CONTEXT_LINES);
  const width = String(last).length;
  const output: string[] = [];
  for (let current = first; current <= last; current++) {
    const marker = current === line ? '>' : ' ';
    output.push(`${marker} ${String(current).padStart(width)} | ${sourceLines[current - 1] ?? ''}`.trimEnd());
    if (current === line && column !== undefined) output.push(`  ${' '.repeat(width)} | ${' '.repeat(Math.max(0, column - 1))}^`);
  }
  return output;
}
