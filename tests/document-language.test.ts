import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('game document declares English and opts out of automatic translation', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<html[^>]*\blang="en"/);
  assert.match(html, /<html[^>]*\btranslate="no"/);
  assert.match(html, /<html[^>]*\bclass="[^"]*\bnotranslate\b[^"]*"/);
  assert.match(html, /<meta\s+name="google"\s+content="notranslate">/);
});
