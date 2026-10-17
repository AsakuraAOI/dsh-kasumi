export const DEFAULT_BUDGETS = Object.freeze({ search: 6144, read: 12288, directory: 6144, shell: 8192, test: 12288, diff: 16384 });
export const bytes = (value) => Buffer.byteLength(value, 'utf8');
export function category(name, args = {}) {
  if (name === 'read') return 'read';
  if (name === 'grep') return 'search';
  if (name === 'glob') return 'directory';
  if (name === 'str_replace_editor') return args.command === 'view' ? 'read' : undefined;
  if (!['bash', 'pwsh', 'bash_persistent', 'pwsh_persistent', 'job_output'].includes(name)) return undefined;
  const command = args.command ?? '';
  if (/\bgit\s+(?:--\S+\s+)*diff\b/i.test(command)) return 'diff';
  if (/\b(?:test|pytest|vitest|jest|tsc|build|check|cargo\s+test|dotnet\s+test)\b/i.test(command)) return 'test';
  if (/\b(?:rg|grep|Select-String)\b/i.test(command)) return 'search';
  if (/\b(?:ls|dir|Get-ChildItem)\b/i.test(command)) return 'directory';
  return 'shell';
}
function cut(text, cap, tail = false) {
  const points = Array.from(text);
  let count = 0, used = 0;
  while (count < points.length) {
    const next = points[tail ? points.length - count - 1 : count];
    if (used + bytes(next) > cap) break;
    used += bytes(next); count++;
  }
  return tail ? points.slice(points.length - count).join('') : points.slice(0, count).join('');
}
const diagnostic = /(?:\[exit code:|\[stderr\]|\[timed out|\[stopped|\[killed|\[sandbox|\b(?:error|exception|failed|failure|AssertionError|assert|FAIL|Traceback)\b|^\s+at\s|^\s*(?:Expected|Received|actual|expected):)/i;
// Preserve diagnostic neighborhoods in original order; head/tail remain useful
// for progress and summaries. The notice and separators count toward the cap.
export function preview(text, cap, notice) {
  if (bytes(text) <= cap) return text;
  const footer = `\n${notice}`;
  const available = cap - bytes(footer) - 80;
  if (available < 64) return undefined;
  const lines = text.split('\n');
  const selected = new Set();
  for (let i = 0; i < lines.length; i++) if (diagnostic.test(lines[i])) {
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 3); j++) selected.add(j);
  }
  const diagnostics = [...selected].sort((a,b) => a-b).map(i => lines[i]).join('\n');
  const diagCap = Math.floor(available * 0.55);
  const diag = bytes(diagnostics) <= diagCap ? diagnostics : `${cut(diagnostics, Math.floor(diagCap / 2))}\n[...]\n${cut(diagnostics, Math.floor(diagCap / 2) - 7, true)}`;
  const remaining = available - bytes(diag);
  const head = cut(text, Math.floor(remaining * 0.45));
  const tail = cut(text, Math.floor(remaining * 0.55), true);
  const result = `${head}\n[... omitted ...]\n${diag ? `[selected diagnostics]\n${diag}\n[...]\n` : ''}${tail}${footer}`;
  return bytes(result) <= cap ? result : undefined;
}
