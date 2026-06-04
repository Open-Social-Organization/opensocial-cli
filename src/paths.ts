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
  return join(projectDir, 'open-social-network.config.json');
}

export function publicDir(projectDir: string): string {
  return join(projectDir, 'public');
}

export function privateKeyPath(projectDir: string): string {
  return join(projectDir, 'private/identity.private.jwk.json');
}

export function messagePrivateKeyPath(projectDir: string): string {
  return join(projectDir, 'private/messages.private.jwk.json');
}

export function profilePath(projectDir: string): string {
  return join(publicDir(projectDir), 'profile.json');
}

export function discoveryPath(projectDir: string): string {
  return join(publicDir(projectDir), '.well-known/open-social-network.json');
}

export function feedPath(projectDir: string): string {
  return join(publicDir(projectDir), 'feed.json');
}

export function actionLogPath(projectDir: string): string {
  return join(publicDir(projectDir), 'opensocial/actions/index.json');
}

export function actionInboxPath(projectDir: string): string {
  return join(publicDir(projectDir), 'opensocial/actions/inbox/index.json');
}

export function followListPath(projectDir: string): string {
  return join(publicDir(projectDir), 'opensocial/follows/index.json');
}

export function messageInboxPath(projectDir: string): string {
  return join(publicDir(projectDir), 'opensocial/messages/inbox/index.json');
}
