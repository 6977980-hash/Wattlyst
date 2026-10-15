import { data, pageInputs } from './lib.mjs';
import { calculators } from '../../../engine/index.js';
for (const id of process.argv.slice(2)) {
  const { calc, inputs } = pageInputs(id);
  const r = calculators[calc](inputs, data);
  const { months, ...rest } = r;
  console.log('==', id, calc, JSON.stringify(inputs).slice(0, 300));
  console.log(JSON.stringify(rest));
}
