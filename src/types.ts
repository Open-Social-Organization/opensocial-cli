export type DeployTarget = 'github' | 'cloudflare';

export interface OpenSocialConfig {
  protocol: 'opensocial';
  version: '0.1';
  handle: string;
  name: string;
  bio: string;
  website: string;
  baseUrl: string;
  deployTarget: DeployTarget;
  projectName: string;
}

export interface OpenSocialIdentity {
  protocol: 'opensocial';
  version: '0.1';
  handle: string;
  name: string;
  bio: string;
  website: string;
  publicKey: {
    alg: 'ES256';
    jwk: JsonWebKey;
  };
  endpoints: {
    profile: string;
    feed: string;
  };
}

export interface UnsignedOpenSocialPost {
  id: string;
  author: string;
  createdAt: string;
  content: string;
}

export interface OpenSocialPost extends UnsignedOpenSocialPost {
  signature: {
    alg: 'ES256';
    value: string;
  };
}

export interface OpenSocialFeed {
  protocol: 'opensocial';
  version: '0.1';
  author: string;
  posts: OpenSocialPost[];
}
