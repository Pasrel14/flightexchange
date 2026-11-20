/** Validation JSON Schema de manifest.json et flight.json, en mode tolérant ou strict. */

import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import manifestSchema from '../schema/manifest.schema.json' with { type: 'json' };
import flightSchema from '../schema/flight.schema.json' with { type: 'json' };
import type { Issues } from './issues.ts';

export { manifestSchema, flightSchema };

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * Variante stricte d'un schéma : tout objet qui déclare des `properties` refuse les propriétés
 * non déclarées, sauf le contenu des `extensions` (SPECIFICATION.md § 11.3).
 */
export function strictVariant(schema: Json): Json {
  if (Array.isArray(schema)) return schema.map(strictVariant);
  if (schema === null || typeof schema !== 'object') return schema;
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(schema)) {
    out[k] = k === 'extensions' && typeof v === 'object' && v !== null && !Array.isArray(v) && '$ref' in v ? v : strictVariant(v);
  }
  if ('properties' in out && !('additionalProperties' in out)) out.additionalProperties = false;
  if (typeof out.$id === 'string') out.$id = out.$id.replace(/\.schema\.json$/, '.strict.schema.json');
  return out;
}

// ajv-formats est un module CommonJS : selon l'outil (Node, Vite), l'export par défaut est imbriqué.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv2020) => void;

let compiled: Record<'manifest' | 'flight', Record<'lax' | 'strict', ValidateFunction>> | undefined;

function validators() {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const m = manifestSchema as unknown as Json;
  const f = flightSchema as unknown as Json;
  compiled = {
    manifest: { lax: ajv.compile(m as object), strict: ajv.compile(strictVariant(m) as object) },
    flight: { lax: ajv.compile(f as object), strict: ajv.compile(strictVariant(f) as object) },
  };
  return compiled;
}

function describe(e: ErrorObject): string {
  if (e.keyword === 'additionalProperties') return `propriété non définie par la spécification : « ${e.params.additionalProperty} »`;
  if (e.keyword === 'required') return `propriété obligatoire absente : « ${e.params.missingProperty} »`;
  return e.message ?? e.keyword;
}

/** Valide un document ; ajoute les anomalies à `issues` et retourne `true` s'il est conforme. */
export function validateDocument(kind: 'manifest' | 'flight', doc: unknown, file: string, issues: Issues, strict: boolean): boolean {
  const v = validators()[kind];
  if (v.lax(doc)) {
    if (!strict || v.strict(doc)) return true;
    for (const e of v.strict.errors ?? []) issues.add('FXF_E_STRICT', describe(e), file, e.instancePath || '/');
    return false;
  }
  for (const e of v.lax.errors ?? []) issues.add('FXF_E_SCHEMA', describe(e), file, e.instancePath || '/');
  return false;
}
