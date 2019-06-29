import { helper } from '@ember/component/helper';

export function formatCurrency([value, ...rest]) {
  let dollars = Math.floor(value / 100);
  let sign = '$';

  return `${sign}${dollars}`;
}

export default helper(formatCurrency);

