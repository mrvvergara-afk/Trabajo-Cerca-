import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
    return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { evaluatePublicJob } = await import('./public-source-verifier.ts');
test.after(() => hooks.deregister());

const url = 'https://www.chiletrabajos.cl/trabajo/trabajador-social-angol-3939921';
const now = Date.parse('2026-11-27T18:00:00Z');
function page(description) {
  const data = { '@type': 'JobPosting', url, title: 'Trabajador social, Angol', description,
    hiringOrganization: { name: 'Fundación Ciudad del Niño' }, datePosted: '2026-11-27 10:18:27',
    validThrough: '2027-02-10T10:18:27', jobLocation: { address: { addressCountry: 'CL', addressLocality: 'Angol', addressRegion: 'AR' } } };
  return '<script type="application/ld+json">' + JSON.stringify(data) + '</script><main>Oferta laboral, jornada completa. Requisitos.</main>';
}

test('a thematic requirement does not override the structured commune of the original offer', () => {
  const result = evaluatePublicJob(url, page('Motivación para trabajar en la temática inherente al Programa.'), url, 200, now);
  assert.equal(result.status, 'verified');
  assert.equal(result.work_commune, 'Angol');
  assert.equal(result.source_published_at, '2026-11-27T13:18:27.000Z');
});

test('an explicit worksite outside the territory still overrides a contradictory structured commune', () => {
  const result = evaluatePublicJob(url, page('Lugar real de trabajo: Santiago. Para trabajar en la temática del programa.'), url, 200, now);
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'worksite_missing_or_multiple');
});
