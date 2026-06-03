import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { addPost, createProject } from '../project.js';
import { validateProject } from '../validate.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('OpenSocial project lifecycle', () => {
  it('creates the standalone page project with public files and a private key', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await createProject({
      targetDir: projectDir,
      handle: 'ada@example.com',
      name: 'Ada Lovelace',
      bio: 'Publishing a sovereign feed.',
      website: 'https://example.com',
      baseUrl: '',
      deployTarget: 'github',
      firstPost: 'Hello from OpenSocial.',
    });

    const profile = await readJson(join(projectDir, 'public/profile.json'));
    const discovery = await readJson(join(projectDir, 'public/.well-known/opensocial.json'));
    const feed = await readJson(join(projectDir, 'public/feed.json'));
    const privateKey = await readJson(join(projectDir, 'private/identity.private.jwk.json'));
    const gitignore = await readFile(join(projectDir, '.gitignore'), 'utf8');
    const nojekyll = await readFile(join(projectDir, 'public/.nojekyll'), 'utf8');

    expect(profile).toEqual(discovery);
    expect(profile.handle).toBe('ada@example.com');
    expect(profile.publicKey.alg).toBe('ES256');
    expect(feed.author).toBe('ada@example.com');
    expect(feed.posts).toHaveLength(1);
    expect(feed.posts[0].signature.alg).toBe('ES256');
    expect(privateKey.d).toBeTypeOf('string');
    expect(gitignore).toContain('private/');
    expect(nojekyll.trim()).toBe('');
  });

  it('does not rotate the private key when init runs again', async () => {
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
      firstPost: 'First post.',
    });
    const before = await readFile(join(projectDir, 'private/identity.private.jwk.json'), 'utf8');

    await createProject({
      targetDir: projectDir,
      handle: 'ada@example.com',
      name: 'Ada Lovelace',
      bio: 'Updated bio',
      website: '',
      baseUrl: '',
      deployTarget: 'cloudflare',
      firstPost: 'This should not duplicate.',
    });
    const after = await readFile(join(projectDir, 'private/identity.private.jwk.json'), 'utf8');
    const feed = await readJson(join(projectDir, 'public/feed.json'));

    expect(after).toBe(before);
    expect(feed.posts).toHaveLength(1);
  });

  it('adds a signed post using the existing key and validates the project', async () => {
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
      firstPost: 'First post.',
    });
    await addPost(projectDir, 'Second signed post.');

    const feed = await readJson(join(projectDir, 'public/feed.json'));
    const validation = await validateProject(projectDir);

    expect(feed.posts.map((post: { content: string }) => post.content)).toEqual([
      'First post.',
      'Second signed post.',
    ]);
    expect(validation.valid).toBe(true);
    expect(validation.verifiedPosts).toBe(2);
  });

  it('reports tampered post content as invalid', async () => {
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
      firstPost: 'Original post.',
    });
    const feedPath = join(projectDir, 'public/feed.json');
    const feed = await readJson(feedPath);
    feed.posts[0].content = 'Tampered content.';
    await writeJson(feedPath, feed);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('post post_001 failed signature verification');
  });

  it('fails cleanly when the private key is missing', async () => {
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
      firstPost: 'Original post.',
    });
    await unlink(join(projectDir, 'private/identity.private.jwk.json'));

    await expect(addPost(projectDir, 'Cannot sign this.')).rejects.toThrow(
      'The private identity key is missing',
    );
    const validation = await validateProject(projectDir);
    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain(
      'private/identity.private.jwk.json is missing; you cannot publish new posts for this identity',
    );
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opensocial-cli-'));
  tempRoots.push(root);
  return root;
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
