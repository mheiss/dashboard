import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('mock gallery serves 50 paginated photos with working images', async () => {
  const server = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: { ...process.env, MOCK_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const output = createInterface({ input: server.stdout });
  try {
    const [line] = await once(output, 'line', { signal: AbortSignal.timeout(10_000) });
    const address = line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(address, `Unexpected server output: ${line}`);

    const page = async (after) => {
      const response = await fetch(`${address}/api/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query Images($first: Int!, $after: String) { images(first: $first, after: $after) { totalCount endCursor hasNextPage items { id thumbnailUrl originalUrl } } }',
          variables: { first: 25, after },
        }),
      });
      assert.equal(response.status, 200);
      return (await response.json()).data.images;
    };

    const first = await page(null);
    assert.equal(first.totalCount, 50);
    assert.equal(first.items.length, 25);
    assert.equal(first.hasNextPage, true);
    assert.ok(first.endCursor);
    const second = await page(first.endCursor);
    assert.equal(second.totalCount, 50);
    assert.equal(second.items.length, 25);
    assert.equal(second.hasNextPage, false);
    const photos = [...first.items, ...second.items];
    assert.equal(new Set(photos.map((photo) => photo.id)).size, 50);

    for (const photo of photos) {
      const response = await fetch(`${address}${photo.thumbnailUrl}`);
      assert.equal(response.status, 200, photo.id);
      assert.match(response.headers.get('content-type'), /^image\/jpeg/);
      await response.arrayBuffer();
    }
    const original = await fetch(`${address}${second.items.at(-1).originalUrl}`);
    assert.equal(original.status, 200);
    await original.arrayBuffer();
  } finally {
    output.close();
    if (server.exitCode === null && server.signalCode === null) {
      const exit = once(server, 'exit');
      server.kill();
      await exit;
    }
  }
});
