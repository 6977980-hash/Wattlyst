// Plain-English messages for engine error codes. The UI shows these instead of a blank or broken result.
// Field labels are passed in by the UI (e.g. { volts: 'Voltage' }); the raw key is used otherwise.

const EXACT = {
  load_must_be_positive: 'Enter a load greater than 0 watts.',
  loads_required: 'Add at least one appliance.',
  bank_voltage_not_multiple_of_battery: 'The bank voltage must be a whole multiple of the battery voltage (for example 24 V = 2 × 12 V).',
  cable_far_too_small_for_load: 'This cable is far too thin for this load and length. Use a thicker cable and confirm with a licensed electrician.',
  city_unknown: 'We do not have sun data for this city yet. Pick the nearest city or enter the yield yourself.',
  inverter_ac_must_use_less: 'The inverter AC must use less power than the non-inverter AC for a payback to exist.',
  n_parallel_must_be_whole: 'Number of parallel strings must be a whole number.',
  n_series_must_be_whole: 'Number of batteries in series must be a whole number.',
  range_invalid: 'The low end of the price range must be below the high end.',
  solar_covers_load: 'Your solar covers the whole daily load even on a cloudy day, so the battery does not run down.',
  tariff_data_missing: 'Tariff data could not be loaded. Please refresh the page.',
  tou_required_at_5kw: 'Connections of 5 kW or more are billed on a Time-of-Use (peak/off-peak) meter. Use the ToU bill option.',
  type_invalid: 'Choose MPPT or PWM.',
  usage_required: 'Enter your monthly units or daily kWh.',
  yield_or_city_or_psh_required: 'Pick a city or enter peak sun hours.',
  protected_max_200_units: 'Protected tariff applies only up to 200 units a month. Above that the unprotected rate applies.',
  lifeline_max_100_units: 'Lifeline tariff applies only up to 100 units a month.',
  history_needs_6_months: 'Enter units for each of the last 6 months.',
  period_unknown: 'We do not have the QTA rate for that quarter. Enter the QTA from your bill.',
  surge_w_required: 'Enter the starting (surge) watts of your load, or leave both surge fields blank.',
  surge_rating_w_required: 'Enter the UPS surge rating from its label, or leave both surge fields blank.',
  appliance_unknown: 'Pick an appliance from the list, or choose Custom and enter its watts.',
  load_exceeds_ups_rating: 'This load is more than the UPS can deliver (VA × power factor). Choose a bigger UPS or reduce the load.',
  surge_exceeds_ups_rating: 'The starting surge is above the UPS surge rating. Choose a bigger UPS or remove the motor load.',
  other_start_below_run: 'Starting watts of the other loads cannot be lower than their running watts.',
  hours_required: 'Enter hours per day for at least one appliance.',
  cable_data_missing: 'Cable data could not be loaded. Please refresh the page.',
  cable_size_unknown: 'Pick a standard cable size.',
  load_above_standard_breakers: 'This load needs more than the largest single-phase MCB. Split it into separate circuits or ask a licensed electrician about a three-phase connection.',
  load_above_cable_table: 'This load is above the largest cable in our table. Split it into separate circuits and consult a licensed electrician.',
  run_too_long_for_table: 'This run is too long for the cables in our table: the voltage drop would exceed the limit. Shorten the run, split the load or consult a licensed electrician.',
  price_data_missing: 'Price data could not be loaded. Enter the typical price range yourself or refresh the page.',
  internal_non_finite: 'These numbers are outside a realistic range. Please check your inputs.',
};

const PATTERNS = [
  [/^history_(\d+)_invalid$/, (m) => `Month ${m[1]}: enter the units as a number (0 or more).`],
  [/^load_(\d+)_start_below_run$/, (m) => `Appliance ${Number(m[1]) + 1}: starting watts cannot be lower than running watts.`],
  [/^load_(\d+)_watts_required$/, (m) => `Appliance ${Number(m[1]) + 1}: enter its watts.`],
  [/^load_(\d+)_\w+_invalid$/, (m) => `Appliance ${Number(m[1]) + 1}: enter a valid number.`],
  [/^(\w+)_required$/, (m, f) => `Enter ${f(m[1])}.`],
  [/^(\w+)_invalid$/, (m, f) => `Enter a valid number for ${f(m[1])}.`],
  [/^(\w+)_must_be_positive$/, (m, f) => `${cap(f(m[1]))} must be greater than 0.`],
  [/^(\w+)_too_small$/, (m, f) => `${cap(f(m[1]))} is too small.`],
  [/^(\w+)_too_large$/, (m, f) => `${cap(f(m[1]))} is too large.`],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function errorMessage(code, labels = {}) {
  if (EXACT[code]) return EXACT[code];
  const f = (key) => labels[key] || key.replace(/_/g, ' ');
  for (const [re, make] of PATTERNS) {
    const m = code.match(re);
    if (m) return make(m, f);
  }
  return 'Something went wrong with this calculation. Please check your inputs.';
}
