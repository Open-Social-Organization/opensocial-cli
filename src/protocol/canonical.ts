import type { OpenSocialPost, UnsignedOpenSocialPost } from '../types.js';

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

export function postSigningPayload(
  post: OpenSocialPost | UnsignedOpenSocialPost,
): UnsignedOpenSocialPost {
  const { signature: _signature, ...payload } = post as OpenSocialPost;
  return payload;
}

function toCanonicalValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not support non-finite numbers.');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : toCanonicalValue(item)));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const canonicalRecord: Record<string, CanonicalValue> = {};

    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) {
        canonicalRecord[key] = toCanonicalValue(item);
      }
    }

    return canonicalRecord;
  }

  throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
}
