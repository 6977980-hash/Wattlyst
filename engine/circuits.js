// N18: circuit sheet for the electrician, one row per circuit, built on the wire size and MCB rules of section W.
// Own module so the single-circuit wiring pages do not ship it. Advisory only: the electrician confirms every circuit.
import { calculator, CalcError, has, num, appliance } from './core.js';
import { wire_size } from './wiring.js';

/** One circuit: connected and design watts, then the section W wire size and MCB for its run. */
function circuitRow(row, idx, shared, d, t) {
  const id = typeof row?.id === 'string' ? row.id.trim() : '';
  const item = id && id !== 'custom' ? appliance(d, id, 'loads') : null;
  const watts = has(row, 'watts') || !item ? num(row, 'watts', { gt: 0, code: item ? `load_${idx}_watts_invalid` : `load_${idx}_watts_required` }) : item.running_w;
  const qty = num(row, 'qty', { def: 1, min: 1, code: `load_${idx}_qty_invalid` });
  if (!Number.isInteger(qty)) throw new CalcError(`load_${idx}_qty_invalid`, 'loads');
  const length_m = num(row, 'length', { gt: 0, code: `load_${idx}_length_invalid` });
  const load_type = item?.load_type ?? 'sockets';
  const connected_w = watts * qty;
  const design_w = load_type === 'inverter_compressor' ? (item.starting_w * watts * qty) / item.running_w : connected_w;
  const circuit = load_type === 'lighting' ? 'lighting' : 'other';
  const w = wire_size.raw({ ...shared, watts: design_w, load_type, length_m, circuit }, d);
  return {
    n: idx + 1, name: item?.name ?? 'Socket circuit (custom)', watts, qty, connected_w, design_w, load_type, circuit, length_m,
    amps: w.ib_a, breaker_a: w.breaker_a, curve: t.curve_by_load[load_type], area_mm2: w.area_mm2, pk_size: w.pk_size,
    drop_pct: w.drop_pct, limit_pct: w.limit_pct, limited_by: w.limited_by,
    volts: w.volts, method: w.method, ambient_c: w.ambient_c, group_circuits: w.circuits, derate: w.derate,
  };
}

/**
 * loads: [{ id, watts, qty, length }], one row per circuit. id picks the appliance (watts, load type); "custom" or blank
 * is a socket circuit of the watts entered. Connected W = watts × qty. Design W = connected W, except an inverter AC,
 * which is designed at its maximum input (starting_w × watts ÷ running_w × qty), as on W1 and W3.
 * Each circuit then runs wire_size (section W: I_b, MCB I_n, smallest cable for the derated ampacity AND the voltage
 * drop over the run, lighting 3% / other 5%) with the shared installation method, air temperature and grouping.
 * MCB curve = data/cable-ampacity.json curve_by_load for the load type. A row error names its row: load_<row>_<code> (load_<row>_length_run_too_long_for_table for a run too long).
 */
export const circuit_schedule = calculator((i, d) => {
  if (!Array.isArray(i.loads) || i.loads.length === 0) throw new CalcError('loads_required', 'loads');
  const t = d?.cables;
  if (!t?.curve_by_load) throw new CalcError('cable_data_missing', 'cables');
  const shared = {};
  for (const k of ['method', 'ambient_c', 'circuits', 'volts']) if (has(i, k)) shared[k] = i[k];
  const rows = i.loads.map((row, idx) => {
    try {
      return circuitRow(row, idx, shared, d, t);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      // A shared setting (method, air temperature, grouping) is wrong for every row: point at that field, not a row.
      if (['method', 'ambient_c', 'circuits', 'volts'].includes(e.field)) throw e;
      // A run too long for the table is fixed in the length cell, so its code names that column (the UI focuses it).
      throw new CalcError(/^load_\d+_/.test(e.code) ? e.code : `load_${idx}_${e.code === 'run_too_long_for_table' ? 'length_' : ''}${e.code}`, 'loads');
    }
  });
  const connected_w = rows.reduce((a, r) => a + r.connected_w, 0);
  const biggest = rows.reduce((b, r) => (r.breaker_a > b.breaker_a ? r : b), rows[0]);
  const { volts, method, ambient_c, group_circuits, derate } = rows[0];
  return {
    circuits_count: rows.length, connected_w, connected_kw: connected_w / 1000, volts, method, ambient_c, group_circuits, derate,
    biggest_breaker_a: biggest.breaker_a, biggest_name: biggest.name, max_drop_pct: Math.max(...rows.map((r) => r.drop_pct)),
    rows: rows.map(({ volts: _v, method: _m, ambient_c: _a, group_circuits: _g, derate: _d, ...r }) => r),
  };
});
