// Shared helpers for every calculator. Pure: no DOM, no WordPress, no globals.

export class CalcError extends Error {
  constructor(code, field) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Sanity cap on any single input (1e12 = 1 TW / 1 TWh); beyond this no home or shop calculation is meaningful. */
const MAX_INPUT = 1e12;
const MIN_FRACTION = 0.05;

/** Checkbox/toggle from a form: true, 'true', 'on', 'yes', '1', 1 → true. */
export const bool = (v) => v === true || v === 1 || (typeof v === 'string' && ['true', 'on', 'yes', '1'].includes(v.trim().toLowerCase()));

/** True when an optional input was actually filled in. */
export const has = (inputs, key) => inputs?.[key] !== undefined && inputs?.[key] !== null && inputs?.[key] !== '';

/**
 * Read a numeric input. Strings like "12.5" are accepted (form fields), with thousands commas ("1,500", lakh style "1,50,000"); blanks fall back to def.
 * opts: { def, min, max, gt, code }  gt = strictly greater than.
 */
export function num(inputs, key, opts = {}) {
  let v = inputs?.[key];
  if (v === undefined || v === null || v === '') v = opts.def;
  if (typeof v === 'string') {
    let t = v.trim();
    if (/^[+-]?\d{1,3}((,\d{3})+|(,\d\d)*,\d{3})(\.\d*)?$/.test(t)) t = t.replace(/,/g, ''); // "1,5" stays invalid
    v = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
  }
  if (v === undefined || v === null) throw new CalcError(opts.code || `${key}_required`, key);
  if (!isNum(v)) throw new CalcError(opts.code || `${key}_invalid`, key);
  if (opts.gt !== undefined && !(v > opts.gt)) throw new CalcError(opts.code || `${key}_must_be_positive`, key);
  if (opts.min !== undefined && v < opts.min) throw new CalcError(opts.code || `${key}_too_small`, key);
  if (opts.max !== undefined && v > opts.max) throw new CalcError(opts.code || `${key}_too_large`, key);
  if (Math.abs(v) > MAX_INPUT) throw new CalcError(opts.code || `${key}_too_large`, key);
  return v;
}

export const pos = (inputs, key, def, code) => {
  const v = num(inputs, key, { def, gt: 0, code });
  // Voltages below 1 V are not a real supply or battery (smallest cell is 1.2 V).
  if (['volts', 'v', 'battery_v'].includes(key) && v < 1) throw new CalcError(code || `${key}_too_small`, key);
  return v;
};
export const nonneg = (inputs, key, def, code) => num(inputs, key, { def, min: 0, code });
/** Fractions such as power factor, efficiency, DoD: MIN_FRACTION <= x <= 1 (below 0.05 nothing real exists). */
export const frac = (inputs, key, def, code) => num(inputs, key, { def, min: MIN_FRACTION, max: 1, code });

export function pick(inputs, key, allowed, def) {
  const v = inputs?.[key] ?? def;
  if (!allowed.includes(v)) throw new CalcError(`${key}_invalid`, key);
  return v;
}

/** ceil that ignores floating-point dust: 3.0000000000004 -> 3, not 4. */
export const ceilSafe = (x) => Math.ceil(x - 1e-9);

/** Look up an appliance from data/appliances.json (data.appliances = { id: item }). */
export function appliance(data, id, field = 'appliance') {
  const key = typeof id === 'string' ? id.trim() : '';
  const item = key ? data?.appliances?.[key] : undefined;
  if (!item || !(item.running_w > 0)) throw new CalcError('appliance_unknown', field);
  return item;
}

/** Read a value from data/defaults.json; a missing default is a bug, not user error. */
export function dflt(data, path) {
  const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data?.defaults);
  if (v === undefined) throw new CalcError(`missing_default_${path}`, path);
  return v;
}

function assertFinite(value, path, allowNegative) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CalcError('internal_non_finite', path);
    if (value < 0 && !allowNegative.includes(path)) throw new CalcError('internal_negative', path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertFinite(v, `${path}[${i}]`, allowNegative));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFinite(v, path ? `${path}.${k}` : k, allowNegative);
  }
}

/**
 * Wrap a calculator so it never throws and never returns NaN, Infinity or an unexpected negative.
 * Result: { ok: true, ...values } or { ok: false, error: code, field }.
 */
export function calculator(fn, { allowNegative = [] } = {}) {
  const wrapped = (inputs = {}, data = {}) => {
    try {
      const out = fn(inputs, data);
      assertFinite(out, '', allowNegative);
      return { ok: true, ...out };
    } catch (e) {
      if (e instanceof CalcError) return { ok: false, error: e.code, field: e.field };
      return { ok: false, error: 'internal_error' };
    }
  };
  wrapped.raw = fn;
  return wrapped;
}
