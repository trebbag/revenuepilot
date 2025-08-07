import { expect, test } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';

function flatten(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      Object.assign(acc, flatten(value, newKey));
    } else {
      acc[newKey] = true;
    }
    return acc;
  }, {});
}

test('All locales match English keys', () => {
  const enKeys = Object.keys(flatten(en)).sort();
  const esKeys = Object.keys(flatten(es)).sort();
  const frKeys = Object.keys(flatten(fr)).sort();
  expect(esKeys).toEqual(enKeys);
  expect(frKeys).toEqual(enKeys);
});

