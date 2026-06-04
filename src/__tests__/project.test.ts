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

describe('Open Social Network project lifecycle', () => {
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
      firstPost: 'Hello from Open Social Network.',
    });

    const profile = await readJson(join(projectDir, 'public/profile.json'));
    const discovery = await readJson(join(projectDir, 'public/.well-known/open-social-network.json'));
    const feed = await readJson(join(projectDir, 'public/feed.json'));
    const actionLog = await readJson(join(projectDir, 'public/opensocial/actions/index.json'));
    const actionInbox = await readJson(
      join(projectDir, 'public/opensocial/actions/inbox/index.json'),
    );
    const followList = await readJson(join(projectDir, 'public/opensocial/follows/index.json'));
    const messageLog = await readJson(join(projectDir, 'public/opensocial/messages/inbox/index.json'));
    const privateKey = await readJson(join(projectDir, 'private/identity.private.jwk.json'));
    const messagePrivateKey = await readJson(join(projectDir, 'private/messages.private.jwk.json'));
    const gitignore = await readFile(join(projectDir, '.gitignore'), 'utf8');
    const nojekyll = await readFile(join(projectDir, 'public/.nojekyll'), 'utf8');
    const pageScript = await readFile(join(projectDir, 'public/page.js'), 'utf8');
    const pageSocialScript = await readFile(join(projectDir, 'public/page-social.js'), 'utf8');
    const indexHtml = await readFile(join(projectDir, 'public/index.html'), 'utf8');

    expect(profile).toEqual(discovery);
    expect(profile.handle).toBe('ada@example.com');
    expect(profile.publicKey.alg).toBe('ES256');
    expect(feed.author).toBe('ada@example.com');
    expect(feed.posts).toHaveLength(1);
    expect(feed.posts[0].signature.alg).toBe('ES256');
    expect(profile.messagePublicKey.alg).toBe('ECDH-P256');
    expect(profile.endpoints.actions).toBe('/opensocial/actions/inbox/index.json');
    expect(profile.endpoints.messages).toBe('/opensocial/messages/inbox/index.json');
    expect(actionLog).toEqual({
      protocol: 'open-social-network',
      version: '0.1',
      actor: 'ada@example.com',
      actions: [],
    });
    expect(actionInbox).toEqual({
      protocol: 'open-social-network',
      version: '0.1',
      owner: 'ada@example.com',
      actions: [],
    });
    expect(followList).toEqual({
      protocol: 'open-social-network',
      version: '0.1',
      owner: 'ada@example.com',
      follows: [],
    });
    expect(messageLog).toEqual({
      protocol: 'open-social-network',
      version: '0.1',
      owner: 'ada@example.com',
      messages: [],
    });
    expect(privateKey.d).toBeTypeOf('string');
    expect(messagePrivateKey.d).toBeTypeOf('string');
    expect(gitignore).toContain('private/');
    expect(nojekyll.trim()).toBe('');
    expect(pageScript).toContain(
      "renderProfileFollows",
    );
    expect(pageScript).toContain("fetchJson('./feed.json')");
    expect(pageScript).toContain("fetchOptionalJson('./opensocial/actions/inbox/index.json'");
    expect(pageScript).toContain("fetchOptionalJson('./opensocial/follows/index.json'");
    expect(pageScript).toContain('renderProfileFollows(followList, profile.handle)');
    expect(pageSocialScript).toContain('export function summarizePostActions');
    expect(pageSocialScript).toContain('export function renderProfileFollows');
    expect(pageSocialScript).toContain('aria-label="Public activity"');
    expect(pageSocialScript).toContain('<strong>Activity</strong>');
    expect(pageSocialScript).toContain('class="social-icon social-icon-like"');
    expect(pageSocialScript).toContain('formatSocialDate(comment.createdAt)');
    expect(pageSocialScript).toContain('escapeHtml(comment.content)');
    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain('<h2>Following</h2>');
    expect(indexHtml).toContain('data-follows');
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

  it('reports an action log actor mismatch as invalid', async () => {
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
    const actionLogPath = join(projectDir, 'public/opensocial/actions/index.json');
    const actionLog = await readJson(actionLogPath);
    actionLog.actor = 'mallory@example.com';
    await writeJson(actionLogPath, actionLog);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('action log actor must match profile handle');
  });

  it('reports a message inbox owner mismatch as invalid', async () => {
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
    const messageLogPath = join(projectDir, 'public/opensocial/messages/inbox/index.json');
    const messageLog = await readJson(messageLogPath);
    messageLog.owner = 'mallory@example.com';
    await writeJson(messageLogPath, messageLog);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('message inbox owner must match profile handle');
  });

  it('reports a public action inbox owner mismatch as invalid', async () => {
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
    const actionInboxPath = join(projectDir, 'public/opensocial/actions/inbox/index.json');
    const actionInbox = await readJson(actionInboxPath);
    actionInbox.owner = 'mallory@example.com';
    await writeJson(actionInboxPath, actionInbox);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('action inbox owner must match profile handle');
  });

  it('reports a follow list owner mismatch as invalid', async () => {
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
    const followListPath = join(projectDir, 'public/opensocial/follows/index.json');
    const followList = await readJson(followListPath);
    followList.owner = 'mallory@example.com';
    await writeJson(followListPath, followList);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('follow list owner must match profile handle');
  });

  it('reports malformed public action inbox actions as invalid', async () => {
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
    const actionInboxPath = join(projectDir, 'public/opensocial/actions/inbox/index.json');
    const actionInbox = await readJson(actionInboxPath);
    actionInbox.actions = { malformed: true };
    await writeJson(actionInboxPath, actionInbox);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('action inbox actions must be an array');
  });

  it('reports a missing public action inbox endpoint as invalid', async () => {
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
    const profilePath = join(projectDir, 'public/profile.json');
    const discoveryPath = join(projectDir, 'public/.well-known/open-social-network.json');
    const profile = await readJson(profilePath);
    delete profile.endpoints.actions;
    await writeJson(profilePath, profile);
    await writeJson(discoveryPath, profile);

    const validation = await validateProject(projectDir);

    expect(validation.valid).toBe(false);
    expect(validation.failures).toContain('profile endpoints must include a public action inbox');
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
  const root = await mkdtemp(join(tmpdir(), 'open-social-network-cli-'));
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
