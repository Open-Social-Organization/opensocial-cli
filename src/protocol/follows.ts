import type { OpenSocialNetworkFollow, OpenSocialNetworkFollowList } from '../types.js';

export type OpenSocialNetworkFollowInput =
  | string
  | {
      profile: string;
      handle?: string;
    };

export function createFollowList(
  owner: string,
  follows: OpenSocialNetworkFollowInput[],
): OpenSocialNetworkFollowList {
  const normalizedOwner = owner.trim();

  if (!normalizedOwner) {
    throw new Error('Follow list owner is required');
  }

  return {
    protocol: 'open-social-network',
    version: '0.1',
    owner: normalizedOwner,
    follows: normalizeFollows(follows),
  };
}

export function isOpenSocialNetworkFollowList(
  value: unknown,
): value is OpenSocialNetworkFollowList {
  if (!isRecord(value)) {
    return false;
  }

  const followList = value as Partial<OpenSocialNetworkFollowList>;

  return (
    followList.protocol === 'open-social-network' &&
    followList.version === '0.1' &&
    isNonEmptyString(followList.owner) &&
    Array.isArray(followList.follows) &&
    followList.follows.every(isOpenSocialNetworkFollow)
  );
}

function normalizeFollows(follows: OpenSocialNetworkFollowInput[]): OpenSocialNetworkFollow[] {
  const followsByProfile = new Map<string, OpenSocialNetworkFollow>();

  for (const follow of follows) {
    const normalizedFollow = normalizeFollow(follow);

    if (!followsByProfile.has(normalizedFollow.profile)) {
      followsByProfile.set(normalizedFollow.profile, normalizedFollow);
    }
  }

  return [...followsByProfile.values()];
}

function normalizeFollow(follow: OpenSocialNetworkFollowInput): OpenSocialNetworkFollow {
  const profile = (typeof follow === 'string' ? follow : follow.profile).trim();

  if (!profile) {
    throw new Error('Follow profile URL is required');
  }

  const handle = typeof follow === 'string' ? undefined : follow.handle?.trim();

  return {
    profile,
    ...(handle ? { handle } : {}),
  };
}

function isOpenSocialNetworkFollow(value: unknown): value is OpenSocialNetworkFollow {
  if (!isRecord(value)) {
    return false;
  }

  const follow = value as Partial<OpenSocialNetworkFollow>;

  return (
    isNonEmptyString(follow.profile) &&
    (follow.handle === undefined || isNonEmptyString(follow.handle))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
