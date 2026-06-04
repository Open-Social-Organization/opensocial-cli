import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDirectory, ensureTextContains, fileExists, readJson, writeJson } from './fs-utils.js';
import {
  actionInboxPath,
  actionLogPath,
  configPath,
  discoveryPath,
  feedPath,
  followListPath,
  messageInboxPath,
  messagePrivateKeyPath,
  privateKeyPath,
  profilePath,
  publicDir,
  templatePublicDir,
} from './paths.js';
import {
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  generateIdentityKeyPair,
  generateMessageKeyPair,
  importMessagePrivateKeyJwk,
  importMessagePublicKeyJwk,
  importPrivateKeyJwk,
  publicJwkFromPrivateJwk,
  publicMessageJwkFromPrivateJwk,
} from './protocol/keys.js';
import { createFollowList } from './protocol/follows.js';
import { decryptDirectMessage, encryptDirectMessage } from './protocol/direct-messages.js';
import { signAction, signPost } from './protocol/signing.js';
import type {
  DeployTarget,
  OpenSocialNetworkActionInbox,
  OpenSocialNetworkActionLog,
  OpenSocialNetworkActionTarget,
  OpenSocialNetworkConfig,
  OpenSocialNetworkDirectMessage,
  OpenSocialNetworkDirectMessageLog,
  OpenSocialNetworkFeed,
  OpenSocialNetworkFollowList,
  OpenSocialNetworkIdentity,
  OpenSocialNetworkReaction,
  UnsignedOpenSocialNetworkAction,
  UnsignedOpenSocialNetworkPost,
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
  const messageKeyResult = await loadOrCreateMessagePrivateKey(projectDir);
  const config = buildConfig(options, projectDir);
  const { profileUrl, feedUrl, actionsUrl, messagesUrl } = endpointUrls(config.baseUrl);
  const profile: OpenSocialNetworkIdentity = {
    protocol: 'open-social-network',
    version: '0.1',
    handle: config.handle,
    name: config.name,
    bio: config.bio,
    website: config.website,
    publicKey: {
      alg: 'ES256',
      jwk: publicJwkFromPrivateJwk(keyResult.privateJwk),
    },
    messagePublicKey: {
      alg: 'ECDH-P256',
      jwk: publicMessageJwkFromPrivateJwk(messageKeyResult.privateJwk),
    },
    endpoints: {
      profile: profileUrl,
      feed: feedUrl,
      actions: actionsUrl,
      messages: messagesUrl,
    },
  };
  const existingFeed = await loadExistingFeed(projectDir);
  const existingActionLog = await loadExistingActionLog(projectDir);
  const existingActionInbox = await loadExistingActionInbox(projectDir);
  const existingFollowList = await loadExistingFollowList(projectDir);
  const existingMessageLog = await loadExistingMessageLog(projectDir);
  const posts = existingFeed?.posts ?? [];

  if (!existingFeed && options.firstPost.trim()) {
    posts.push(
      await signPost(createUnsignedPost('post_001', profile.handle, options.firstPost), keyResult.privateJwk),
    );
  }

  const feed: OpenSocialNetworkFeed = {
    protocol: 'open-social-network',
    version: '0.1',
    author: profile.handle,
    posts,
  };
  const actionLog: OpenSocialNetworkActionLog = existingActionLog ?? {
    protocol: 'open-social-network',
    version: '0.1',
    actor: profile.handle,
    actions: [],
  };
  const actionInbox: OpenSocialNetworkActionInbox = existingActionInbox ?? {
    protocol: 'open-social-network',
    version: '0.1',
    owner: profile.handle,
    actions: [],
  };
  const followList: OpenSocialNetworkFollowList =
    existingFollowList ?? createFollowList(profile.handle, []);
  const messageLog: OpenSocialNetworkDirectMessageLog = existingMessageLog ?? {
    protocol: 'open-social-network',
    version: '0.1',
    owner: profile.handle,
    messages: [],
  };

  await writeJson(configPath(projectDir), config);
  await writeJson(profilePath(projectDir), profile);
  await writeJson(discoveryPath(projectDir), profile);
  await writeJson(feedPath(projectDir), feed);
  await writeJson(actionLogPath(projectDir), actionLog);
  await writeJson(actionInboxPath(projectDir), actionInbox);
  await writeJson(followListPath(projectDir), followList);
  await writeJson(messageInboxPath(projectDir), messageLog);

  return {
    projectDir,
    profileUrl,
    feedUrl,
    keyCreated: keyResult.created,
    postCount: posts.length,
  };
}

export async function addPost(projectDirInput: string, content: string): Promise<OpenSocialNetworkFeed> {
  const projectDir = resolve(projectDirInput);
  const privateJwk = await requirePrivateKey(projectDir);
  const profile = await readJson<OpenSocialNetworkIdentity>(profilePath(projectDir));
  const feed = await readJson<OpenSocialNetworkFeed>(feedPath(projectDir));
  const postNumber = feed.posts.length + 1;
  const id = `post_${String(postNumber).padStart(3, '0')}`;

  feed.posts.push(await signPost(createUnsignedPost(id, profile.handle, content), privateJwk));
  await writeJson(feedPath(projectDir), feed);
  return feed;
}

export interface AddReactionOptions {
  reaction: OpenSocialNetworkReaction;
  postId: string;
  author: string;
  url?: string;
}

export interface AddCommentOptions {
  content: string;
  postId: string;
  author: string;
  url?: string;
}

export interface CreateDirectMessageOptions {
  content: string;
  recipient: string;
  outputPath?: string;
}

export interface CreatedDirectMessageSummary {
  message: OpenSocialNetworkDirectMessage;
  outputPath: string;
  recipient: OpenSocialNetworkIdentity;
}

export interface ReadDirectMessageOptions {
  messagePath: string;
  sender: string;
}

export interface ReadDirectMessageSummary {
  sender: OpenSocialNetworkIdentity;
  recipient: OpenSocialNetworkIdentity;
  content: string;
  createdAt: string;
}

export interface ImportedDirectMessageSummary extends ReadDirectMessageSummary {
  added: boolean;
  messageCount: number;
}

interface OpenedDirectMessageSummary extends ReadDirectMessageSummary {
  message: OpenSocialNetworkDirectMessage;
}

export async function addReaction(
  projectDirInput: string,
  options: AddReactionOptions,
): Promise<OpenSocialNetworkActionLog> {
  return appendSignedAction(projectDirInput, {
    kind: 'reaction',
    target: actionTargetFromOptions(options),
    reaction: options.reaction,
  });
}

export async function addComment(
  projectDirInput: string,
  options: AddCommentOptions,
): Promise<OpenSocialNetworkActionLog> {
  return appendSignedAction(projectDirInput, {
    kind: 'comment',
    target: actionTargetFromOptions(options),
    content: options.content,
  });
}

export async function createDirectMessage(
  projectDirInput: string,
  options: CreateDirectMessageOptions,
): Promise<CreatedDirectMessageSummary> {
  const content = options.content.trim();
  if (!content) {
    throw new Error('Message content is required');
  }

  const projectDir = resolve(projectDirInput);
  const privateJwk = await requirePrivateKey(projectDir);
  const profile = await readJson<OpenSocialNetworkIdentity>(profilePath(projectDir));
  const recipient = await readProfileInput(
    options.recipient,
    'Could not find the recipient profile. Use --to with a page folder, public folder, profile.json file, or profile URL.',
  );

  if (recipient.handle === profile.handle) {
    throw new Error('Choose another page to message.');
  }

  if (recipient.messagePublicKey?.alg !== 'ECDH-P256' || !recipient.messagePublicKey.jwk) {
    throw new Error(`${recipient.name || recipient.handle} has not turned on messages yet.`);
  }

  const createdAt = new Date().toISOString();
  const message = await encryptDirectMessage(
    {
      id: createMessageId(createdAt),
      sender: profile.handle,
      recipient: recipient.handle,
      createdAt,
      content,
    },
    await importPrivateKeyJwk(privateJwk),
    await importMessagePublicKeyJwk(recipient.messagePublicKey.jwk),
  );
  const outputPath = resolve(
    options.outputPath ?? join(projectDir, 'private/messages/outbox', `${message.id}.json`),
  );
  await writeJson(outputPath, message);
  return { message, outputPath, recipient };
}

export async function readDirectMessage(
  projectDirInput: string,
  options: ReadDirectMessageOptions,
): Promise<ReadDirectMessageSummary> {
  const opened = await openDirectMessage(projectDirInput, options);

  return {
    sender: opened.sender,
    recipient: opened.recipient,
    content: opened.content,
    createdAt: opened.createdAt,
  };
}

export async function importDirectMessage(
  projectDirInput: string,
  options: ReadDirectMessageOptions,
): Promise<ImportedDirectMessageSummary> {
  const projectDir = resolve(projectDirInput);
  const opened = await openDirectMessage(projectDir, options);
  const messageLog = await loadMessageInboxForWrite(projectDir, opened.recipient.handle);
  const alreadyExists = messageLog.messages.some(
    (message) => isMessageWithId(message, opened.message.id),
  );

  if (!alreadyExists) {
    messageLog.messages = [opened.message, ...messageLog.messages];
    await writeJson(messageInboxPath(projectDir), messageLog);
  }

  return {
    sender: opened.sender,
    recipient: opened.recipient,
    content: opened.content,
    createdAt: opened.createdAt,
    added: !alreadyExists,
    messageCount: messageLog.messages.length,
  };
}

async function openDirectMessage(
  projectDirInput: string,
  options: ReadDirectMessageOptions,
): Promise<OpenedDirectMessageSummary> {
  const projectDir = resolve(projectDirInput);
  const profile = await readJson<OpenSocialNetworkIdentity>(profilePath(projectDir));
  const messagePrivateJwk = await requireMessagePrivateKey(projectDir);
  const message = await readJson<OpenSocialNetworkDirectMessage>(resolve(options.messagePath));
  const sender = await readProfileInput(
    options.sender,
    'Could not find the sender profile. Use --from with a page folder, public folder, profile.json file, or profile URL.',
  );

  if (message.recipient !== profile.handle) {
    throw new Error('This message was sent to a different page.');
  }

  if (message.sender !== sender.handle) {
    throw new Error('The sender profile does not match this message.');
  }

  const content = await decryptDirectMessage(
    message,
    await importMessagePrivateKeyJwk(messagePrivateJwk),
    sender,
  );

  return {
    message,
    sender,
    recipient: profile,
    content,
    createdAt: message.createdAt,
  };
}

async function loadMessageInboxForWrite(
  projectDir: string,
  ownerHandle: string,
): Promise<OpenSocialNetworkDirectMessageLog> {
  const path = messageInboxPath(projectDir);

  if (!(await fileExists(path))) {
    return {
      protocol: 'open-social-network',
      version: '0.1',
      owner: ownerHandle,
      messages: [],
    };
  }

  const messageLog = await readJson<OpenSocialNetworkDirectMessageLog>(path);

  if (messageLog.protocol !== 'open-social-network' || messageLog.version !== '0.1') {
    throw new Error('Message inbox is not a valid Open Social Network inbox.');
  }

  if (messageLog.owner !== ownerHandle) {
    throw new Error('Message inbox owner does not match this page.');
  }

  if (!Array.isArray(messageLog.messages)) {
    throw new Error('Message inbox messages must be an array.');
  }

  return messageLog;
}

function isMessageWithId(value: unknown, id: string): boolean {
  return Boolean(value && typeof value === 'object' && 'id' in value && value.id === id);
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

async function requireMessagePrivateKey(projectDir: string): Promise<JsonWebKey> {
  const path = messagePrivateKeyPath(projectDir);
  if (!(await fileExists(path))) {
    throw new Error(
      'The private message key is missing. Restore private/messages.private.jwk.json from your backup before reading messages.',
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

async function loadOrCreateMessagePrivateKey(
  projectDir: string,
): Promise<{ privateJwk: JsonWebKey; created: boolean }> {
  const path = messagePrivateKeyPath(projectDir);
  if (await fileExists(path)) {
    return { privateJwk: await readJson<JsonWebKey>(path), created: false };
  }

  const keyPair = await generateMessageKeyPair();
  const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
  const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const privateWithPublic = { ...privateJwk, x: publicJwk.x, y: publicJwk.y };

  await writeJson(path, privateWithPublic);
  await chmod(path, 0o600);
  return { privateJwk: privateWithPublic, created: true };
}

async function loadExistingFeed(projectDir: string): Promise<OpenSocialNetworkFeed | null> {
  const path = feedPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialNetworkFeed>(path);
}

async function loadExistingActionLog(projectDir: string): Promise<OpenSocialNetworkActionLog | null> {
  const path = actionLogPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialNetworkActionLog>(path);
}

async function loadExistingActionInbox(
  projectDir: string,
): Promise<OpenSocialNetworkActionInbox | null> {
  const path = actionInboxPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialNetworkActionInbox>(path);
}

async function loadExistingFollowList(projectDir: string): Promise<OpenSocialNetworkFollowList | null> {
  const path = followListPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialNetworkFollowList>(path);
}

async function loadExistingMessageLog(
  projectDir: string,
): Promise<OpenSocialNetworkDirectMessageLog | null> {
  const path = messageInboxPath(projectDir);
  if (!(await fileExists(path))) {
    return null;
  }
  return readJson<OpenSocialNetworkDirectMessageLog>(path);
}

function buildConfig(options: CreateProjectOptions, projectDir: string): OpenSocialNetworkConfig {
  return {
    protocol: 'open-social-network',
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

function endpointUrls(baseUrl: string): {
  profileUrl: string;
  feedUrl: string;
  actionsUrl: string;
  messagesUrl: string;
} {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    profileUrl: normalized ? `${normalized}/profile.json` : '/profile.json',
    feedUrl: normalized ? `${normalized}/feed.json` : '/feed.json',
    actionsUrl: normalized
      ? `${normalized}/opensocial/actions/inbox/index.json`
      : '/opensocial/actions/inbox/index.json',
    messagesUrl: normalized
      ? `${normalized}/opensocial/messages/inbox/index.json`
      : '/opensocial/messages/inbox/index.json',
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/u, '');
}

function createUnsignedPost(id: string, author: string, content: string): UnsignedOpenSocialNetworkPost {
  return {
    id,
    author,
    createdAt: new Date().toISOString(),
    content,
  };
}

type AppendSignedActionInput =
  | {
      kind: 'reaction';
      target: OpenSocialNetworkActionTarget;
      reaction: OpenSocialNetworkReaction;
    }
  | {
      kind: 'comment';
      target: OpenSocialNetworkActionTarget;
      content: string;
    };

async function appendSignedAction(
  projectDirInput: string,
  input: AppendSignedActionInput,
): Promise<OpenSocialNetworkActionLog> {
  const projectDir = resolve(projectDirInput);
  const privateJwk = await requirePrivateKey(projectDir);
  const profile = await readJson<OpenSocialNetworkIdentity>(profilePath(projectDir));
  const actionLog = await readJson<OpenSocialNetworkActionLog>(actionLogPath(projectDir));
  const createdAt = new Date().toISOString();
  const signedAction = await signAction(
    {
      ...input,
      id: createActionId(input.kind, createdAt),
      actor: profile.handle,
      createdAt,
    } as UnsignedOpenSocialNetworkAction,
    privateJwk,
  );

  if (actionLog.actor !== profile.handle) {
    throw new Error('The public action log does not belong to this page.');
  }

  if (!Array.isArray(actionLog.actions)) {
    throw new Error('The public action log is malformed.');
  }

  actionLog.actions.push(signedAction);
  await writeJson(actionLogPath(projectDir), actionLog);
  return actionLog;
}

function actionTargetFromOptions(options: {
  postId: string;
  author: string;
  url?: string;
}): OpenSocialNetworkActionTarget {
  const target: OpenSocialNetworkActionTarget = {
    type: 'post',
    id: options.postId,
    author: options.author,
  };

  if (options.url?.trim()) {
    target.url = options.url.trim();
  }

  return target;
}

function createActionId(kind: 'reaction' | 'comment', createdAt: string): string {
  return `${kind}_${Date.parse(createdAt).toString(36)}_${randomUUID()}`;
}

function createMessageId(createdAt: string): string {
  return `message_${Date.parse(createdAt).toString(36)}_${randomUUID()}`;
}

async function readProfileInput(
  input: string,
  missingProfileMessage: string,
): Promise<OpenSocialNetworkIdentity> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Choose a profile page folder, public folder, profile.json file, or profile URL.');
  }

  if (/^https?:\/\//iu.test(trimmed)) {
    return readRemoteProfile(trimmed);
  }

  const path = trimmed.startsWith('file://') ? fileURLToPath(trimmed) : trimmed;
  const resolved = resolve(path);
  const candidates = [
    join(resolved, 'public/profile.json'),
    join(resolved, 'profile.json'),
    resolved.endsWith('.html') ? join(dirname(resolved), 'profile.json') : resolved,
    join(dirname(resolved), 'profile.json'),
  ];

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return readJson<OpenSocialNetworkIdentity>(candidate);
    }
  }

  throw new Error(missingProfileMessage);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readRemoteProfile(input: string): Promise<OpenSocialNetworkIdentity> {
  const response = await fetch(remoteProfileUrl(input));
  if (!response.ok) {
    throw new Error(`Could not open profile (${response.status}).`);
  }
  return (await response.json()) as OpenSocialNetworkIdentity;
}

function remoteProfileUrl(input: string): string {
  const url = new URL(input);
  if (url.pathname.endsWith('/profile.json')) {
    return url.toString();
  }
  if (url.pathname.endsWith('/index.html')) {
    url.pathname = `${url.pathname.slice(0, -'index.html'.length)}profile.json`;
    return url.toString();
  }
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/profile.json`;
  return url.toString();
}

export async function readProjectName(projectDir: string): Promise<string> {
  if (await fileExists(configPath(projectDir))) {
    const config = await readJson<OpenSocialNetworkConfig>(configPath(projectDir));
    return config.projectName;
  }
  return basename(resolve(projectDir));
}

export async function readProjectConfig(projectDir: string): Promise<OpenSocialNetworkConfig> {
  return readJson<OpenSocialNetworkConfig>(configPath(projectDir));
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
