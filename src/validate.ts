import { fileExists, readJson } from './fs-utils.js';
import {
  actionInboxPath,
  actionLogPath,
  discoveryPath,
  feedPath,
  followListPath,
  messageInboxPath,
  privateKeyPath,
  profilePath,
} from './paths.js';
import { verifyPost } from './protocol/signing.js';
import type {
  OpenSocialNetworkActionInbox,
  OpenSocialNetworkActionLog,
  OpenSocialNetworkDirectMessageLog,
  OpenSocialNetworkFeed,
  OpenSocialNetworkFollowList,
  OpenSocialNetworkIdentity,
} from './types.js';

export interface ValidationResult {
  valid: boolean;
  verifiedPosts: number;
  failures: string[];
}

export async function validateProject(projectDir: string): Promise<ValidationResult> {
  const failures: string[] = [];
  let verifiedPosts = 0;

  if (!(await fileExists(privateKeyPath(projectDir)))) {
    failures.push(
      'private/identity.private.jwk.json is missing; you cannot publish new posts for this identity',
    );
  }

  if (!(await fileExists(profilePath(projectDir)))) {
    failures.push('public/profile.json is missing');
  }
  if (!(await fileExists(discoveryPath(projectDir)))) {
    failures.push('public/.well-known/open-social-network.json is missing');
  }
  if (!(await fileExists(feedPath(projectDir)))) {
    failures.push('public/feed.json is missing');
  }
  if (!(await fileExists(actionLogPath(projectDir)))) {
    failures.push('public/opensocial/actions/index.json is missing');
  }
  if (!(await fileExists(actionInboxPath(projectDir)))) {
    failures.push('public/opensocial/actions/inbox/index.json is missing');
  }
  if (!(await fileExists(followListPath(projectDir)))) {
    failures.push('public/opensocial/follows/index.json is missing');
  }
  if (!(await fileExists(messageInboxPath(projectDir)))) {
    failures.push('public/opensocial/messages/inbox/index.json is missing');
  }

  if (failures.some((failure) => failure.endsWith('is missing'))) {
    return { valid: false, verifiedPosts, failures };
  }

  const profile = await readJson<OpenSocialNetworkIdentity>(profilePath(projectDir));
  const discovery = await readJson<OpenSocialNetworkIdentity>(discoveryPath(projectDir));
  const feed = await readJson<OpenSocialNetworkFeed>(feedPath(projectDir));
  const actionLog = await readJson<OpenSocialNetworkActionLog>(actionLogPath(projectDir));
  const actionInbox = await readJson<OpenSocialNetworkActionInbox>(actionInboxPath(projectDir));
  const followList = await readJson<OpenSocialNetworkFollowList>(followListPath(projectDir));
  const messageLog = await readJson<OpenSocialNetworkDirectMessageLog>(messageInboxPath(projectDir));

  if (profile.protocol !== 'open-social-network' || profile.version !== '0.1') {
    failures.push('profile.json must declare Open Social Network protocol version 0.1');
  }

  if (JSON.stringify(profile) !== JSON.stringify(discovery)) {
    failures.push('.well-known/open-social-network.json must match profile.json');
  }

  if (feed.protocol !== 'open-social-network' || feed.version !== '0.1') {
    failures.push('feed.json must declare Open Social Network protocol version 0.1');
  }

  if (feed.author !== profile.handle) {
    failures.push('feed author must match profile handle');
  }

  if (typeof profile.endpoints?.actions !== 'string') {
    failures.push('profile endpoints must include a public action inbox');
  }

  if (actionLog.protocol !== 'open-social-network' || actionLog.version !== '0.1') {
    failures.push('action log must declare Open Social Network protocol version 0.1');
  }

  if (actionLog.actor !== profile.handle) {
    failures.push('action log actor must match profile handle');
  }

  if (!Array.isArray(actionLog.actions)) {
    failures.push('action log actions must be an array');
  }

  if (actionInbox.protocol !== 'open-social-network' || actionInbox.version !== '0.1') {
    failures.push('action inbox must declare Open Social Network protocol version 0.1');
  }

  if (actionInbox.owner !== profile.handle) {
    failures.push('action inbox owner must match profile handle');
  }

  if (!Array.isArray(actionInbox.actions)) {
    failures.push('action inbox actions must be an array');
  }

  if (Array.isArray(actionInbox.actions)) {
    for (const action of actionInbox.actions) {
      if (action?.target?.author !== profile.handle) {
        failures.push(`action ${action?.id || '(missing id)'} must target this page owner`);
      }
    }
  }

  if (followList.protocol !== 'open-social-network' || followList.version !== '0.1') {
    failures.push('follow list must declare Open Social Network protocol version 0.1');
  }

  if (followList.owner !== profile.handle) {
    failures.push('follow list owner must match profile handle');
  }

  if (!Array.isArray(followList.follows)) {
    failures.push('follow list follows must be an array');
  } else {
    for (const follow of followList.follows) {
      if (typeof follow?.profile !== 'string' || follow.profile.trim().length === 0) {
        failures.push('follow list entries must include profile URLs');
      }
      if (follow?.handle !== undefined && typeof follow.handle !== 'string') {
        failures.push('follow list entry handles must be strings when present');
      }
    }
  }

  if (messageLog.protocol !== 'open-social-network' || messageLog.version !== '0.1') {
    failures.push('message inbox must declare Open Social Network protocol version 0.1');
  }

  if (messageLog.owner !== profile.handle) {
    failures.push('message inbox owner must match profile handle');
  }

  if (!Array.isArray(messageLog.messages)) {
    failures.push('message inbox messages must be an array');
  }

  for (const post of feed.posts || []) {
    if (await verifyPost(post, profile)) {
      verifiedPosts += 1;
    } else {
      failures.push(`post ${post.id || '(missing id)'} failed signature verification`);
    }
  }

  return {
    valid: failures.length === 0,
    verifiedPosts,
    failures,
  };
}
