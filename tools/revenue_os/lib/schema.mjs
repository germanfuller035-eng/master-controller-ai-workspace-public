// tools/revenue_os/lib/schema.mjs
// Minimal dependency-free JSON-shape validator. Deterministic. Returns {ok, errors[]}.
// Supports: type, required, enum, min, max, items, properties, nullable, pattern.

export function validate(value, schema, pathPrefix = '') {
  const errors = [];
  check(value, schema, pathPrefix || '$', errors);
  return { ok: errors.length === 0, errors };
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function check(value, schema, p, errors) {
  if (schema.nullable && value === null) return;
  if (value === undefined) {
    if (schema.required) errors.push(`${p}: required but missing`);
    return;
  }
  if (schema.type) {
    const t = typeOf(value);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(t)) {
      errors.push(`${p}: expected ${types.join('|')}, got ${t}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${p}: '${value}' not in enum [${schema.enum.join(', ')}]`);
  }
  if (typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) errors.push(`${p}: ${value} < min ${schema.min}`);
    if (schema.max !== undefined && value > schema.max) errors.push(`${p}: ${value} > max ${schema.max}`);
  }
  if (typeof value === 'string' && schema.pattern) {
    if (!new RegExp(schema.pattern).test(value)) errors.push(`${p}: '${value}' fails pattern ${schema.pattern}`);
  }
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((it, i) => check(it, schema.items, `${p}[${i}]`, errors));
  }
  if (schema.properties && typeOf(value) === 'object') {
    for (const [k, sub] of Object.entries(schema.properties)) {
      check(value[k], sub, `${p}.${k}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!schema.properties[k]) errors.push(`${p}.${k}: unexpected property`);
      }
    }
  }
}

// Helper to build a required field.
export function req(type, extra = {}) { return { type, required: true, ...extra }; }
export function opt(type, extra = {}) { return { type, ...extra }; }
