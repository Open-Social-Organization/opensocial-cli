import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { deployCloudflare, deployGitHub } from '../deploy.js';
import { createProject } from '../project.js';
import type { CommandRunner } from '../shell.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('deploy adapters', () => {
  it('gives exact GitHub CLI guidance when gh is missing', async () => {
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
      firstPost: 'Deploy me.',
    });

    await expect(
      deployGitHub(projectDir, {
        runner: missingCommandRunner,
      }),
    ).rejects.toThrow('Install GitHub CLI from https://cli.github.com/ and run gh auth login');
  });

  it('gives exact Wrangler guidance when Wrangler is missing', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await createProject({
      targetDir: projectDir,
      handle: 'ada@example.com',
      name: 'Ada Lovelace',
      bio: '',
      website: '',
      baseUrl: '',
      deployTarget: 'cloudflare',
      firstPost: 'Deploy me.',
    });

    await expect(
      deployCloudflare(projectDir, {
        runner: missingCommandRunner,
      }),
    ).rejects.toThrow('Install Wrangler from https://developers.cloudflare.com/workers/wrangler/install-and-update/ and run wrangler login');
  });

  it('deploys only the public directory to Cloudflare Pages', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');
    const commands: string[] = [];
    const runner: CommandRunner = async (command, args, options) => {
      commands.push([command, ...args].join(' '));
      return {
        code: 0,
        stdout: command === 'wrangler' && args[0] === 'whoami' ? 'user@example.com' : '',
        stderr: '',
        cwd: options?.cwd,
      };
    };

    await createProject({
      targetDir: projectDir,
      handle: 'ada@example.com',
      name: 'Ada Lovelace',
      bio: '',
      website: '',
      baseUrl: '',
      deployTarget: 'cloudflare',
      firstPost: 'Deploy me.',
    });

    await deployCloudflare(projectDir, { runner });

    expect(commands).toContain('wrangler --version');
    expect(commands).toContain('wrangler whoami');
    expect(commands.some((command) => command.includes('pages deploy public'))).toBe(true);
    expect(commands.some((command) => command.includes('private'))).toBe(false);
  });
});

const missingCommandRunner: CommandRunner = async (command) => ({
  code: command === 'node' ? 0 : 127,
  stdout: '',
  stderr: 'not found',
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opensocial-cli-'));
  tempRoots.push(root);
  return root;
}
