import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cp } from 'node:fs/promises';
import { publicDir } from './paths.js';
import { readProjectConfig, readProjectName } from './project.js';
import { validateProject } from './validate.js';
import {
  requireCommand,
  requireSuccessful,
  runCommand,
  type CommandRunner,
} from './shell.js';

export interface DeployOptions {
  runner?: CommandRunner;
  projectName?: string;
}

export interface DeployResult {
  target: 'github' | 'cloudflare';
  url?: string;
}

const githubGuidance =
  'Install GitHub CLI from https://cli.github.com/ and run gh auth login before deploying to GitHub Pages.';
const wranglerGuidance =
  'Install Wrangler from https://developers.cloudflare.com/workers/wrangler/install-and-update/ and run wrangler login before deploying to Cloudflare Pages.';

export async function deployGitHub(
  projectDirInput: string,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const projectDir = resolve(projectDirInput);
  const runner = options.runner ?? runCommand;
  await assertValidForDeploy(projectDir);
  await requireCommand('gh', githubGuidance, runner);
  await requireSuccessful('gh', ['auth', 'status'], runner, { guidance: githubGuidance });

  const owner = (await requireSuccessful('gh', ['api', 'user', '--jq', '.login'], runner)).stdout.trim();
  const projectName = options.projectName ?? (await readProjectName(projectDir));
  await ensureGitHubRepo(owner, projectName, runner);
  await publishGitHubPagesBranch(owner, projectName, projectDir, runner);
  await enableGitHubPages(owner, projectName, runner);

  return {
    target: 'github',
    url: `https://${owner}.github.io/${projectName}/`,
  };
}

export async function deployCloudflare(
  projectDirInput: string,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const projectDir = resolve(projectDirInput);
  const runner = options.runner ?? runCommand;
  await assertValidForDeploy(projectDir);
  await requireCommand('wrangler', wranglerGuidance, runner);
  await requireSuccessful('wrangler', ['whoami'], runner, { guidance: wranglerGuidance });

  const projectName = options.projectName ?? (await readProjectName(projectDir));
  await requireSuccessful(
    'wrangler',
    ['pages', 'deploy', 'public', '--project-name', projectName, '--branch', 'main'],
    runner,
    { cwd: projectDir },
  );

  return { target: 'cloudflare' };
}

export async function deployProject(
  projectDir: string,
  options: DeployOptions & { target?: 'github' | 'cloudflare' } = {},
): Promise<DeployResult> {
  const config = await readProjectConfig(projectDir);
  const target = options.target ?? config.deployTarget;
  return target === 'github'
    ? deployGitHub(projectDir, options)
    : deployCloudflare(projectDir, options);
}

async function assertValidForDeploy(projectDir: string): Promise<void> {
  const validation = await validateProject(projectDir);
  if (!validation.valid) {
    throw new Error(`Fix validation before deploying:\n${validation.failures.join('\n')}`);
  }
}

async function ensureGitHubRepo(
  owner: string,
  projectName: string,
  runner: CommandRunner,
): Promise<void> {
  const view = await runner('gh', ['repo', 'view', `${owner}/${projectName}`]);
  if (view.code === 0) {
    return;
  }
  await requireSuccessful(
    'gh',
    [
      'repo',
      'create',
      `${owner}/${projectName}`,
      '--public',
      '--description',
      'A sovereign OpenSocial page.',
    ],
    runner,
  );
}

async function publishGitHubPagesBranch(
  owner: string,
  projectName: string,
  projectDir: string,
  runner: CommandRunner,
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'opensocial-gh-pages-'));
  try {
    await cp(publicDir(projectDir), tempDir, { recursive: true });
    await requireSuccessful('git', ['init', '-b', 'gh-pages'], runner, { cwd: tempDir });
    await requireSuccessful('git', ['config', 'user.name', 'OpenSocial CLI'], runner, {
      cwd: tempDir,
    });
    await requireSuccessful('git', ['config', 'user.email', 'opensocial-cli@users.noreply.github.com'], runner, {
      cwd: tempDir,
    });
    await requireSuccessful('git', ['add', '-A'], runner, { cwd: tempDir });
    await requireSuccessful('git', ['commit', '-m', 'Publish OpenSocial page'], runner, {
      cwd: tempDir,
    });
    await requireSuccessful(
      'git',
      ['remote', 'add', 'origin', `git@github.com:${owner}/${projectName}.git`],
      runner,
      { cwd: tempDir },
    );
    await requireSuccessful('git', ['push', '-f', 'origin', 'gh-pages'], runner, {
      cwd: tempDir,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function enableGitHubPages(
  owner: string,
  projectName: string,
  runner: CommandRunner,
): Promise<void> {
  const body = JSON.stringify({ source: { branch: 'gh-pages', path: '/' } });
  const result = await runner(
    'gh',
    ['api', `repos/${owner}/${projectName}/pages`, '--method', 'POST', '--input', '-'],
    { input: body },
  );

  if (result.code !== 0 && !result.stderr.includes('already exists')) {
    throw new Error(result.stderr || 'Could not enable GitHub Pages');
  }
}
