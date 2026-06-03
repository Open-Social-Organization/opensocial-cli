import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '../project.js';
import { createPreviewServer } from '../preview.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('createPreviewServer', () => {
  it('serves the generated page and protocol JSON files', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await createProject({
      targetDir: projectDir,
      handle: 'ada@example.com',
      name: 'Ada Lovelace',
      bio: '',
      website: '',
      baseUrl: '',
      deployTarget: 'github',
      firstPost: 'Preview me.',
    });

    const preview = await createPreviewServer(projectDir, { port: 0 });

    try {
      const html = await fetchText(`${preview.url}/`);
      const profile = await fetchJson(`${preview.url}/profile.json`);
      const feed = await fetchJson(`${preview.url}/feed.json`);

      expect(html).toContain('OpenSocial Sovereign Page');
      expect(profile.handle).toBe('ada@example.com');
      expect(feed.posts).toHaveLength(1);
    } finally {
      await preview.close();
    }
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opensocial-cli-'));
  tempRoots.push(root);
  return root;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}
