// Plain-English messages for engine error codes. The UI shows these instead of a blank or broken result.
// Texts for exact codes live in engine/message-text.js (build and tests); the browser gets only the texts its page
// can show (tool config `msg`), so this file stays small on every page (audit 2026-10-21 WL-226). Generic codes
// (<field>_required, _invalid, _too_small ...) are built here from the page's field label, unit, default and limit.

// The one text a page needs before its config is read.
const START = { calculator_failed: 'The calculator could not start. Please refresh the page.' };

const row = (m) => `Appliance ${Number(m[1]) + 1}: `; // codes count rows from 0, people from 1
// make(m, c, f): f(key) = the field's label with its unit, c = the call's context (fields, texts, limit).
const PATTERNS = [
  // Codes that carry a limit from data/ print that number, so a changed limit keeps its message (WL-107).
  [/^(protected|lifeline)_max_(\d+)_units$/, (m) => `${cap(m[1])} tariff applies only up to ${m[2]} units a month.${m[1] == 'protected' ? ' Above that the unprotected rate applies.' : ''}`],
  [/^history_needs_(\d+)_months$/, (m) => `Enter units for each of the last ${m[1]} months.`],
  [/^history_(\d+)_invalid$/, (m) => `Month ${m[1]}: enter the units as a number (0 or more).`],
  [/^load_(\d+)_start_below_run$/, (m) => `${row(m)}starting watts cannot be lower than running watts.`],
  [/^load_(\d+)_watts_required$/, (m) => `${row(m)}enter its watts.`],
  [/^load_(\d+)_hours_invalid$/, (m) => `${row(m)}hours per day must be a number from 0 to 24.`],
  [/^load_(\d+)_start_invalid$/, (m) => `${row(m)}enter its starting watts as a number (0 or more).`],
  [/^load_(\d+)_qty_invalid$/, (m) => `${row(m)}enter how many as a whole number (0 or more).`],
  [/^(?:load|appliance)_(\d+)_(?:\w+_)?invalid$/, (m) => `${row(m)}enter its watts as a number (0 or more).`],
  [/^load_(\d+)_(?:length_(?=r))?(.+)$/, (m, c) => row(m) + errorMessage(m[2], { ...c, fields: [] })], // any other row code: "Appliance 2: " + its plain message (WL-124)
  // Generic codes name the field with its unit and, where known, an example (the field's default) or the limit (WL-226).
  [/^(\w+)_required$/, (m, c, f) => `Enter ${f(m[1])}${eg(c, m[1])}.`],
  [/^(\w+)_invalid$/, (m, c, f) => (fld(c, m[1]).options ? `Choose ${f(m[1])} from the list.` : `Enter ${f(m[1])} as a plain number${eg(c, m[1]) || ', for example 12 or 1500'}.`)],
  [/^(\w+)_must_be_positive$/, (m, c, f) => `${cap(f(m[1]))} must be greater than 0${eg(c, m[1])}.`],
  [/^(\w+)_too_(small|large)$/, (m, c, f) => cap(f(m[1])) + (c.limit == null ? ` is too ${m[2]}. Check the number and its unit.` : m[2] == 'small' ? ` must be at least ${lim(c)}.` : ` must be ${lim(c)} or less.`)],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fld = (c, key) => c.fields?.find((x) => x.name === key) || {};
const lim = (c) => c.limit.toLocaleString('en-US');
// The field's own default as an example (not for a pick list or a list of rows).
const eg = (c, key) => { const d = fld(c, key).default; return d != null && typeof d != 'object' && !fld(c, key).options ? `, for example ${d}` : ''; };

/** Warning flags on a valid result and the notice each prints (the flag name is the notice code unless mapped). */
export const NOTICES = { solar_above_sanctioned: 1, low_confidence: 'price_low_confidence', over_cable_rating: 'cable_over_current_rating', ampacity_checked: 'ampacity_not_checked_aluminium', protected_lost: 'ac_protected_lost', ac_above_sanctioned: 1, usage_both: 1, typical_used: 1, per_unit_hidden: 1, battery_unknown: 1, high_c_rate: 1, string_below_bus: 1 };

/** Notice for a valid result that carries a warning flag (shown above the results, same text in build and browser). */
export function noticeCode(out) {
  const above = Object.keys(out).filter((k) => k.endsWith('above_standard_sizes') && out[k] === true);
  // A generator gets its own advice (two sets or an industrial set), not "split the array or circuit".
  if (above.includes('drive_above_standard_sizes')) return 'drive_above_standard_sizes'; // one larger drive, never two
  if (above.length) return above.every((k) => k === 'generator_above_standard_sizes' || 'recommended_kva' in out) ? 'generator_above_standard_sizes' : 'above_standard_sizes';
  // Every flag warns when true, except ampacity_checked, which warns when false (aluminium cable).
  for (const k in NOTICES) if (out[k] === (k != 'ampacity_checked')) return NOTICES[k] === 1 ? k : NOTICES[k];
  return '';
}

/**
 * c: { fields: the page's fields (name, label, unit, default, options), texts: { code: text } for exact codes,
 * limit: the bound an input broke (from the engine) }.
 */
export function errorMessage(code, c = {}) {
  const t = c.texts?.[code] || START[code];
  if (t) return t;
  const f = (key) => {
    const x = fld(c, key);
    return (x.label || key.replace(/_/g, ' ')).replace(/^[A-Z](?=[a-z])/, (s) => s.toLowerCase()) + (x.unit ? ` (${x.unit})` : '');
  };
  for (const [re, make] of PATTERNS) {
    const m = code.match(re);
    if (m) return make(m, c, f);
  }
  return 'Something went wrong with this calculation. Please check your inputs.';
}
