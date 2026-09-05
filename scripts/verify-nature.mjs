import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Server-side compilation/markup check only. This does not claim browser or GPU QA.
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { default: Page } = await server.ssrLoadModule('/app/page.jsx');
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const label of [
    '自然の世界',
    '水を注ぐ',
    '火をつける',
    '土を盛る',
    '地面を掘る',
    '緑を増やす',
    '雨を降らす',
    '2D',
    '3D',
  ])
    assert.ok(html.includes(label), label);
  assert.ok(html.includes('<canvas'));
  assert.ok(!html.includes('F = ma') && !html.includes('実験室'));
  console.log(
    'Nature page SSR compilation and primary controls passed; browser/GPU not tested.',
  );
} finally {
  await server.close();
}
