// Nov 2026: primeras pruebas automáticas del servidor. Son de piezas sin red ni base de datos.
// Correr (desde functions/):  npm run build  y luego  node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('la agenda del Arquitecto se separa del texto que ve el autor', () => {
    const { splitAgenda } = require('../lib/arquitecto_conectar.js');
    const r = splitAgenda('Decidamos el narrador.\n\n[[AGENDA]] {"puntos":[{"t":"Narrador","e":"ahora"},{"t":"Final","e":"pendiente"}],"cerrar":false}');
    assert.equal(r.text, 'Decidamos el narrador.');
    assert.equal(r.agenda.length, 2);
    assert.equal(r.agenda[0].e, 'ahora');
    assert.equal(r.cerrar, false);
});

test('una respuesta sin agenda no rompe nada', () => {
    const { splitAgenda } = require('../lib/arquitecto_conectar.js');
    const r = splitAgenda('Solo texto.');
    assert.equal(r.text, 'Solo texto.');
    assert.equal(r.agenda, null);
});

test('la fecha del canon se escribe legible y calla si no hay fecha', () => {
    const { dateTag } = require('../lib/utils/canon_dates.js');
    assert.match(dateTag('2026-10-03T12:00:00Z'), /cambió por última vez el 3 oct 2026/);
    assert.equal(dateTag(''), '');
    assert.equal(dateTag('no-es-fecha'), '');
});

test('el tope mensual de IA tiene un valor sensato por defecto', () => {
    const { monthlyCapUsd } = require('../lib/utils/claude_router.js');
    const prev = process.env.CLAUDE_MONTHLY_CAP_USD;
    delete process.env.CLAUDE_MONTHLY_CAP_USD;
    assert.equal(monthlyCapUsd(), 8);
    process.env.CLAUDE_MONTHLY_CAP_USD = 'abc';
    assert.equal(monthlyCapUsd(), 8);
    process.env.CLAUDE_MONTHLY_CAP_USD = '12.5';
    assert.equal(monthlyCapUsd(), 12.5);
    if (prev === undefined) delete process.env.CLAUDE_MONTHLY_CAP_USD; else process.env.CLAUDE_MONTHLY_CAP_USD = prev;
});

test('sin invitación ni clave propia, nadie recibe la clave de MyWorld', () => {
    const { getAIKey } = require('../lib/utils/security.js');
    assert.equal(getAIKey({ customGeminiKey: 'clave-del-autor' }, 'clave-de-myworld'), 'clave-del-autor');
    assert.throws(() => getAIKey({}, 'clave-de-myworld'));
});
