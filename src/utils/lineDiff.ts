// Oct 2026: diferencia por líneas (LCS) para mostrar qué cambia en una ficha antes de guardarla.
export interface DiffLine { type: 'same' | 'add' | 'del'; text: string }

export function lineDiff(before: string, after: string): DiffLine[] {
    const a = before.replace(/\r\n/g, '\n').split('\n');
    const b = after.replace(/\r\n/g, '\n').split('\n');
    const n = a.length, m = b.length;
    if (n * m > 4_000_000) return [...a.map(t => ({ type: 'del' as const, text: t })), ...b.map(t => ({ type: 'add' as const, text: t }))];
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out: DiffLine[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
        else { out.push({ type: 'add', text: b[j] }); j++; }
    }
    while (i < n) out.push({ type: 'del', text: a[i++] });
    while (j < m) out.push({ type: 'add', text: b[j++] });
    return out;
}
