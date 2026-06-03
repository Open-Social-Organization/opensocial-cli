import { chmod, mkdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { copyDirectory, ensureTextContains, fileExists, readJson, writeJson } from './fs-utils.js';
import {
  configPath,
  discoveryPath,
  feedPath,
  privateKeyPath,
  profilePath,
  publicDir,
  templatePublicDir,
} from './paths.js';
import {
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  generateIdentityKeyPair,
  publicJwkFromPrivateJwk,
} from './protocol/keys.js';
import { signPost } from './protocol/signing.js';
import type {
  DeployTarget,
  OpenSocialConfig,
  OpenSocialFeed,
  OpenSocialIdentity,
  UnsignedOpenSocialPost,
} from './types.js';

export interface CreateProjectOptions {
  targetDir: string;
  handle: string;
  name: string;
  bio: string;
  website: string;
  baseUrl: string;
  deployTarget: DeployTarget;
  firstPost: string;
}

export interface ProjectSummary {
  projectDir: string;
  profileUrl: string;
  feedUrl: string;
  keyCreated: boolean;
  postCount: number;
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectSummary> {
  const projectDir = resolve(options.targetDir);
  await mkdir(projectDir, { recursive: true });
  await copyDirectory(templatePublicDir(), publicDir(projectDir));
  await ensureTextContains(join(projectDir, '.gitignore'), 'private/\nnode_modules/\ndist/\n.DS_Store\n');

  const keyResult = await loadOrCreatePrivateKey(projectDir);
  const config = buildConfig(options, projectDir);
  const { profileUrl, feedUrl } = endpointUrls(config.baseUrl);
  const profile: OpenSocialIdentity = {
    protocol: 'opensocial',
    version: '0.1',
    handle: config.handle,
    name: config.name,
    bio: config.bio,
    website: config.website,
    publicKey: {
      alg: 'ES256',
      jwk: publicJwkFromPrivateJwk(keyResult.privateJwk),
    },
    endpoints: {
      profile: profileUrl,
      feed: feedUrl,
    },
  };
  const existingFeed = await loadExistingFeed(projectDir);
  const posts = existingFeed?.posts ?? [];

  if (!existingFeed && options.firstPost.trim()) {
    posts.push(
      await signPost(createUnsignedPost('post_001', profile.handle, options.firstPost), keyResult.privateJwk),
    );
  }

  const feed: OpenSocialFeed = {
    protocol: 'opensocial',
    version: '0.1',
    author: profile.handle,
    posts,
  };

  await writeJson(configPath(projectDir), config);
  await writeJson(profilePath(projectDir), profile);
  await writeJson(discoveryPath(projectDir), profile);
  await writeJson(feedPath(projectDir), feed);

  return {
    projectDir,
    profileUrl,
    feedUrl,
    keyCreated: keyResult.created,
    postCount: posts.length,
  };
}

export async function addPost(projectDirInput: string, content: string): Promise<OpenSocialFeed> {
  const projectDir = resolve(projectDirInput);
  const privateJwk = await requirePrivateKey(projectDir);
  const profile = await readJson<OpenSocialIdentity>(profilePath(projectDir));
  const feed = await readJson<OpenSocialFeed>(feedPath(projectDir));
  const postNumber = feed.posts.length + 1;
  const id = `post_${String(postNumber).padStart(3, '0')}`;

  feed.posts.push(await signPost(createUnsignedPost(id, profile.handle, content), privateJwk));
  await writeJson(feedPath(projectDir), feed);
  return feed;
}

export async function requirePrivateKey(projectDir: string): Promise<JsonWebKey> {
  const path = privateKeyPath(projectDir);
  if (!(await fileExists(path))) {
    throw new Error(
      'The private identity key is missing. Restore private/identity.private.jwk.json from your backup before adding posts.',
    );
  }
  return readJson<JsonWebKey>(path);
}

async function loadOrCreatePrivateKey(
  projectDir: string,
): Promise<{ privateJwk: JsonWebKey; created: boolean }> {
  const path = privateKeyPath(projectDir);
  if (await fileExists(path)) {
    return { privateJwk: await readJson<JsonWebKey>(path), created: false };
  }

  const keyPair = await generateIdentityKeyPair();
  const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
  const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const privateWithPublic = { ...privateJwk, x: publicJwk.x, y: publicJwk.y };

  await writeJson(path, privateWithPublic);
  await chmod(path, 0o600);
  return { privateJwk: privateWithPublic, created: true };
}

async function loadExistingFeed(projectDir: string): Promise<OpenSocialFeed | null> {
  const path = feedPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialFeed>(path);
}

function buildConfig(options: CreateProjectOptions, projectDir: string): OpenSocialConfig {
  return {
    protocol: 'opensocial',
    version: '0.1',
    handle: options.handle,
    name: options.name,
    bio: options.bio,
    website: options.website,
    baseUrl: normalizeBaseUrl(options.baseUrl),
    deployTarget: options.deployTarget,
    projectName: basename(projectDir),
  };
}

function endpointUrls(baseUrl: string): { profileUrl: string; feedUrl: string } {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    profileUrl: normalized ? `${normalized}/profile.json` : '/profile.json',
    feedUrl: normalized ? `${normalized}/feed.json` : '/feed.json',
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/u, '');
}

function createUnsignedPost(id: string, author: string, content: string): UnsignedOpenSocialPost {
  return {
    id,
    author,
    createdAt: new Date().toISOString(),
    content,
  };
}

export async function readProjectName(projectDir: string): Promise<string> {
  if (await fileExists(configPath(projectDir))) {
    const config = await readJson<OpenSocialConfig>(configPath(projectDir));
    return config.projectName;
  }
  return basename(resolve(projectDir));
}

export async function readProjectConfig(projectDir: string): Promise<OpenSocialConfig> {
  return readJson<OpenSocialConfig>(configPath(projectDir));
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
