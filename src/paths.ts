import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));

export function packageRoot(): string {
  return join(sourceDir, '..');
}

export function templatePublicDir(): string {
  return join(packageRoot(), 'templates/page/public');
}

export function configPath(projectDir: string): string {
  return join(projectDir, 'opensocial.config.json');
}

export function publicDir(projectDir: string): string {
  return join(projectDir, 'public');
}

export function privateKeyPath(projectDir: string): string {
  return join(projectDir, 'private/identity.private.jwk.json');
}

export function profilePath(projectDir: string): string {
  return join(publicDir(projectDir), 'profile.json');
}

export function discoveryPath(projectDir: string): string {
  return join(publicDir(projectDir), '.well-known/opensocial.json');
}

export function feedPath(projectDir: string): string {
  return join(publicDir(projectDir), 'feed.json');
}
