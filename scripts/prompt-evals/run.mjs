// Nov 2026: banco de conversaciones para probar los prompts de MyWorld antes de desplegar.
// Repite los mensajes del autor de cada caso contra el prompt ACTUAL del código y otro modelo califica
// cada respuesta contra la lista de comprobaciones del caso.
//
// Uso (desde la raíz del repo). Usa la misma clave y espacio de trabajo que MyWorld (los lee de functions/.env;
// no los guarda ni los imprime). Si no están ahí, ponlos antes en la terminal:
//   $env:ANTHROPIC_API_KEY = "..." ; $env:ANTHROPIC_WORKSPACE_ID = "wrkspc_..."
//   node scripts/prompt-evals/run.mjs                 -> todos los casos
//   node scripts/prompt-evals/run.mjs ideas-el-tajo   -> solo ese caso
//   node scripts/prompt-evals/run.mjs --dry           -> muestra qué enviaría, sin llamar a la IA (gratis)
// Cuesta unos centavos por caso. Las respuestas quedan en scripts/prompt-evals/resultados/ (no se suben a git).
//
// Para añadir un caso: copia un .json de cases/, pega los mensajes del autor en "turnos" y escribe en
// "comprobaciones" lo que la respuesta NO debe hacer (o debe hacer), una frase por comprobación.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.filter(a => !a.startsWith('--'));

/** Saca del código una constante de texto: const NOMBRE = `…`; */
function constFrom(file, name) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*\`([\\s\\S]*?)\`;`));
    if (!m) throw new Error(`No encontré ${name} en ${file}`);
    return m[1].replace(/\\`/g, '`').replace(/\\\$/g, '$');
}

// Qué prompt usa cada herramienta. Para probar otra, añade su línea aquí.
const TOOLS = {
    ideas: () => constFrom('functions/src/whatif.ts', 'WHATIF_SYSTEM') + '\n\n' + constFrom('functions/src/utils/claude_router.ts', 'MYWORLD_VOICE'),
    mira: () => constFrom('functions/src/prompts/mira.ts', 'MIRA_SYSTEM') + '\n\n' + constFrom('functions/src/utils/claude_router.ts', 'MYWORLD_VOICE'),
};
const MODEL = (fs.readFileSync(path.join(root, 'functions/src/utils/claude_router.ts'), 'utf8').match(/CLAUDE_SONNET\s*=\s*"([^"]+)"/) || [])[1];
const JUDGE = (fs.readFileSync(path.join(root, 'functions/src/utils/claude_router.ts'), 'utf8').match(/CLAUDE_HAIKU\s*=\s*"([^"]+)"/) || [])[1];

const cases = fs.readdirSync(path.join(here, 'cases')).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(here, 'cases', f), 'utf8')))
    .filter(c => !only.length || only.includes(c.id));
if (!cases.length) { console.error('No hay casos con ese nombre.'); process.exit(1); }

/** El mismo armado que hace la función en el servidor, sin memoria ni imágenes. */
function userContent(c, history, message) {
    const canon = c.canon?.trim()
        ? `FRAGMENTOS DE SU CANON (cada uno empieza con el nombre del documento entre paréntesis y, si se sabe, cuándo cambió por última vez; sirven para no inventar y para avisar choques, no para limitar):\n${c.canon.trim()}`
        : 'FRAGMENTOS DE SU CANON: ninguno esta vez. Trabaja con lo que cuenta el autor y no cites documentos. No hace falta avisarle que no los tienes, salvo que te pregunte por algo de su canon; y si ya se lo dijiste en esta conversación, no lo repitas.';
    const convo = history.map(m => (m.role === 'user' ? 'AUTOR: ' : 'TÚ: ') + m.text).join('\n\n');
    const turns = history.filter(m => m.role === 'user').length + 1;
    return [canon, convo ? `CONVERSACIÓN HASTA AHORA:\n${convo}` : '', `(Mensaje ${turns} del autor en esta conversación.)`, `AUTOR: ${message}`].filter(Boolean).join('\n\n');
}

if (dry) {
    for (const c of cases) {
        const system = TOOLS[c.herramienta]();
        console.log(`\n=== ${c.id} · ${c.turnos.length} turnos · ${c.comprobaciones.length} comprobaciones · prompt de ${system.length} caracteres · modelo ${MODEL}`);
        console.log(userContent(c, [], c.turnos[0]).slice(0, 400) + '…');
    }
    process.exit(0);
}

// La clave y el espacio de trabajo son los mismos que usa MyWorld: si no están en el entorno, se leen de functions/.env*
// (solo esas dos variables; nunca se imprimen).
for (const f of fs.readdirSync(path.join(root, 'functions')).filter(f => /^\.env(\..+)?$/.test(f) && !/example/i.test(f))) {
    for (const line of fs.readFileSync(path.join(root, 'functions', f), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)\s*=\s*["']?([^"'#\s]+)["']?/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
if (!process.env.ANTHROPIC_API_KEY) { console.error('Falta ANTHROPIC_API_KEY (ni en el entorno ni en functions/.env). Prueba primero con --dry.'); process.exit(1); }
const sdk = await import(pathToFileURL(path.join(root, 'functions/node_modules/@anthropic-ai/sdk/index.mjs')).href).catch(() => import('@anthropic-ai/sdk'));
const client = new (sdk.default || sdk.Anthropic)({
    // La clave de MyWorld no está atada a un espacio de trabajo: hay que decir cuál, igual que hace el servidor.
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
});
const explain = e => {
    if (/anthropic-workspace-id/.test(String(e?.message))) { console.error('\nLa clave pide el espacio de trabajo y no encontré ANTHROPIC_WORKSPACE_ID en functions/.env.\nPonlo así y vuelve a correr:  $env:ANTHROPIC_WORKSPACE_ID = "wrkspc_..."  (está en la consola de Anthropic, en Workspaces).'); process.exit(1); }
    console.error('\nLa IA respondió con un error: ' + (e?.message || e)); process.exit(1);
};
process.on('unhandledRejection', explain);
const text = res => (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

const outDir = path.join(here, 'resultados');
fs.mkdirSync(outDir, { recursive: true });
let failed = 0, total = 0, unknown = 0;

for (const c of cases) {
    const system = TOOLS[c.herramienta]();
    const history = [];
    for (const turno of c.turnos) {
        const res = await client.messages.create({
            model: MODEL, max_tokens: 4000, output_config: { effort: 'medium' },
            system: [{ type: 'text', text: system }],
            messages: [{ role: 'user', content: userContent(c, history, turno) }],
        });
        history.push({ role: 'user', text: turno }, { role: 'assistant', text: text(res) });
    }
    const transcript = history.map((m, i) => `${m.role === 'user' ? 'AUTOR' : `IA (respuesta ${(i + 1) / 2})`}:\n${m.text}`).join('\n\n---\n\n');
    const judge = await client.messages.create({
        model: MODEL, max_tokens: 3000, output_config: { effort: 'medium' }, // el revisor rápido se contradecía («Revisado: SI» marcado como NO)
        system: [{ type: 'text', text: 'Eres un revisor estricto de una IA que acompaña a escritores. Recibes una conversación y una lista numerada de comprobaciones. Para cada una decide si las respuestas de la IA la CUMPLEN. Decide primero y escribe un solo veredicto por línea: no razones en voz alta ni te corrijas dentro de la línea. Una propuesta dicha como «¿y si…?» no cuenta como pregunta al autor. Recoger en una frase lo que el autor acaba de decir no cuenta como volver a contar la idea entera. Si dudas, no cumple. Responde SOLO con una línea por comprobación, en este formato exacto y sin nada más:\nN | SI | motivo corto\nN | NO | cita corta de la respuesta que lo incumple\n(N es el número de la comprobación.)' }],
        messages: [{ role: 'user', content: `CANON QUE RECIBIÓ LA IA:\n${c.canon?.trim() || '(ninguno)'}\n\nCONVERSACIÓN:\n${transcript}\n\nCOMPROBACIONES:\n${c.comprobaciones.map((x, i) => `${i + 1}. ${x}`).join('\n')}` }],
    });
    // Una línea por comprobación («3 | NO | cita»): aguanta comillas dentro de las citas, que rompían el JSON.
    const verdicts = text(judge).split(/\r?\n/).map(l => l.match(/^\s*(\d+)\s*\|\s*(SI|SÍ|NO)\s*\|?\s*(.*)$/i)).filter(Boolean)
        .map(m => ({ n: Number(m[1]), cumple: /^S/i.test(m[2]), prueba: m[3].trim() }));
    console.log(`\n=== ${c.id}`);
    c.comprobaciones.forEach((x, i) => {
        const v = verdicts.find(v => v.n === i + 1);
        if (!v) { unknown++; console.log(`  ¿?    ${x}\n          → el revisor no dio veredicto: léela tú en el archivo de resultados`); return; }
        total++;
        if (!v.cumple) failed++;
        console.log(`${v.cumple ? '  ok  ' : ' FALLA'}  ${x}${!v.cumple && v.prueba ? `\n          → ${v.prueba}` : ''}`);
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(outDir, `${c.id} ${stamp}.md`), `# ${c.id}\n\n${transcript}\n\n## Veredictos\n\n${c.comprobaciones.map((x, i) => { const v = verdicts.find(v => v.n === i + 1); return `- ${!v ? 'SIN VEREDICTO' : v.cumple ? 'ok' : 'FALLA'}: ${x}${v?.prueba ? ` — «${v.prueba}»` : ''}`; }).join('\n')}\n`);
}
console.log(`\n${total - failed} de ${total} comprobaciones cumplidas${unknown ? ` (${unknown} sin veredicto)` : ''}. Las conversaciones completas están en scripts/prompt-evals/resultados/.`);
process.exit(failed ? 1 : 0);
