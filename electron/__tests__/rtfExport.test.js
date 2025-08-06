import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, test, expect } from 'vitest';
import parseRTF from 'rtf-parser';
import { writeRtfFile } from '../rtfExporter.js';

describe('RTF export', () => {
  test('generated RTF parses without errors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-test-'));
    const file = path.join(dir, 'note.rtf');
    writeRtfFile(file, 'Hello', 'World');
    const doc = await new Promise((resolve, reject) => {
      parseRTF.stream(fs.createReadStream(file), (err, d) => {
        if (err) reject(err);
        else resolve(d);
      });
    });
    const texts = doc.content.map(p => p.content.map(s => s.value).join(''));
    expect(texts).toContain('Beautified Note:');
    expect(texts).toContain('Hello');
    expect(texts).toContain('Summary:');
    expect(texts).toContain('World');
  });
});
