import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../cli-runner.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('runCli', () => {
  it('initializes, posts, and validates using command arguments', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');
    const output: string[] = [];

    expect(
      await runCli(
        [
          'init',
          projectDir,
          '--name',
          'Ada Lovelace',
          '--handle',
          'ada@example.com',
          '--first-post',
          'Hello from the CLI.',
          '--target',
          'github',
        ],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);
    expect(await runCli(['post', 'A second post.', '--project', projectDir], {})).toBe(0);
    expect(await runCli(['validate', '--project', projectDir], {})).toBe(0);

    const feed = JSON.parse(await readFile(join(projectDir, 'public/feed.json'), 'utf8'));
    expect(feed.posts).toHaveLength(2);
    expect(output.join('\n')).toContain('Back up private/identity.private.jwk.json');
  });

  it('returns a nonzero exit code for validation failures', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await runCli(
      [
        'init',
        projectDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from the CLI.',
      ],
      {},
    );
    const feedPath = join(projectDir, 'public/feed.json');
    const feed = JSON.parse(await readFile(feedPath, 'utf8'));
    feed.posts[0].content = 'Changed later.';
    const { writeFile } = await import('node:fs/promises');
    await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

    expect(await runCli(['validate', '--project', projectDir], {})).toBe(1);
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opensocial-cli-'));
  tempRoots.push(root);
  return root;
}
