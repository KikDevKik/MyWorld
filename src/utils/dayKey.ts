// Nov 2026: el día se cuenta en la hora local del autor. Antes se usaba la fecha UTC y, por la noche en
// Colombia (UTC-5), lo escrito caía en el día siguiente o la semana mostraba un día corrido.
export function localDayKey(d: Date = new Date()): string {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
