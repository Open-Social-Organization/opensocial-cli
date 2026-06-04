export type DeployTarget = 'github' | 'cloudflare' | 'folder';

export interface OpenSocialNetworkConfig {
  protocol: 'open-social-network';
  version: '0.1';
  handle: string;
  name: string;
  bio: string;
  website: string;
  baseUrl: string;
  deployTarget: DeployTarget;
  projectName: string;
}

export interface OpenSocialNetworkMessagePublicKey {
  alg: 'ECDH-P256';
  jwk: JsonWebKey;
}

export interface OpenSocialNetworkIdentity {
  protocol: 'open-social-network';
  version: '0.1';
  handle: string;
  name: string;
  bio: string;
  website: string;
  publicKey: {
    alg: 'ES256';
    jwk: JsonWebKey;
  };
  messagePublicKey?: OpenSocialNetworkMessagePublicKey;
  endpoints: {
    profile: string;
    feed: string;
    actions?: string;
    messages?: string;
  };
}

export interface UnsignedOpenSocialNetworkPost {
  id: string;
  author: string;
  createdAt: string;
  content: string;
}

export interface OpenSocialNetworkPost extends UnsignedOpenSocialNetworkPost {
  signature: {
    alg: 'ES256';
    value: string;
  };
}

export interface OpenSocialNetworkFeed {
  protocol: 'open-social-network';
  version: '0.1';
  author: string;
  posts: OpenSocialNetworkPost[];
}

export interface OpenSocialNetworkFollow {
  profile: string;
  handle?: string;
}

export interface OpenSocialNetworkFollowList {
  protocol: 'open-social-network';
  version: '0.1';
  owner: string;
  follows: OpenSocialNetworkFollow[];
}

export type OpenSocialNetworkReaction = 'like' | 'dislike' | 'none';

export interface OpenSocialNetworkActionTarget {
  type: 'post';
  id: string;
  author: string;
  url?: string;
}

interface OpenSocialNetworkActionBase {
  id: string;
  kind: 'reaction' | 'comment';
  actor: string;
  createdAt: string;
  target: OpenSocialNetworkActionTarget;
  signature: {
    alg: 'ES256';
    value: string;
  };
}

export interface OpenSocialNetworkReactionAction extends OpenSocialNetworkActionBase {
  kind: 'reaction';
  reaction: OpenSocialNetworkReaction;
}

export interface OpenSocialNetworkCommentAction extends OpenSocialNetworkActionBase {
  kind: 'comment';
  content: string;
}

export type OpenSocialNetworkAction =
  | OpenSocialNetworkReactionAction
  | OpenSocialNetworkCommentAction;

export interface OpenSocialNetworkActionLog {
  protocol: 'open-social-network';
  version: '0.1';
  actor: string;
  actions: OpenSocialNetworkAction[];
}

export interface OpenSocialNetworkActionInbox {
  protocol: 'open-social-network';
  version: '0.1';
  owner: string;
  actions: OpenSocialNetworkAction[];
}

export interface OpenSocialNetworkDirectMessageLog {
  protocol: 'open-social-network';
  version: '0.1';
  owner: string;
  messages: unknown[];
}
