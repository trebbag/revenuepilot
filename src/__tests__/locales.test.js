import { expect, test } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import enPublic from '../../public/locales/en/translation.json';
import esPublic from '../../public/locales/es/translation.json';

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

test('Spanish locale matches English keys', () => {
  const enKeys = Object.keys(flatten(en)).sort();
  const esKeys = Object.keys(flatten(es)).sort();
  expect(esKeys).toEqual(enKeys);
});

test('Spanish public locale matches English keys', () => {
  const enKeys = Object.keys(flatten(enPublic)).sort();
  const esKeys = Object.keys(flatten(esPublic)).sort();
  expect(esKeys).toEqual(enKeys);
});
