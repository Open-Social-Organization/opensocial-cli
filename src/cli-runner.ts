import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { addPost, createProject } from './project.js';
import { validateProject } from './validate.js';
import { createPreviewServer } from './preview.js';
import { deployProject } from './deploy.js';
import type { DeployTarget } from './types.js';

export interface CliIO {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export async function runCli(args: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((line: string) => console.log(line));
  const stderr = io.stderr ?? ((line: string) => console.error(line));
  const [commandOrPath, ...rest] = args;
  const command = isCommand(commandOrPath) ? commandOrPath : 'init';
  const commandArgs = command === 'init' && commandOrPath && !isCommand(commandOrPath) ? args : rest;

  try {
    switch (command) {
      case 'init':
        await runInit(commandArgs, stdout);
        return 0;
      case 'post':
        await runPost(commandArgs, stdout);
        return 0;
      case 'validate':
        return runValidate(commandArgs, stdout, stderr);
      case 'preview':
        await runPreview(commandArgs, stdout);
        return 0;
      case 'deploy':
        await runDeploy(commandArgs, stdout);
        return 0;
      case 'help':
      case '--help':
      case '-h':
        stdout(helpText());
        return 0;
      default:
        stderr(`Unknown command: ${command}`);
        stderr(helpText());
        return 1;
    }
  } catch (error) {
    stderr(error instanceof Error ? error.message : 'OpenSocial CLI failed.');
    return 1;
  }
}

async function runInit(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const targetDir = parsed.positionals[0] ?? (await prompt('Project folder', 'my-opensocial-page'));
  const name = parsed.options.name ?? (await prompt('Your display name', 'OpenSocial Founder'));
  const handle = parsed.options.handle ?? (await prompt('Your OpenSocial handle', 'founder@example.com'));
  const bio =
    parsed.options.bio ??
    (await prompt('Short bio', 'Publishing a sovereign OpenSocial page on the open web.'));
  const website = parsed.options.website ?? (await prompt('Website URL', ''));
  const baseUrl = parsed.options['base-url'] ?? (await prompt('Public base URL, if known', ''));
  const deployTarget = normalizeTarget(
    parsed.options.target ?? (await prompt('Deploy target: github or cloudflare', 'github')),
  );
  const firstPost =
    parsed.options['first-post'] ??
    (await prompt('First post', 'Hello from my sovereign OpenSocial page.'));
  const summary = await createProject({
    targetDir,
    handle,
    name,
    bio,
    website,
    baseUrl,
    deployTarget,
    firstPost,
  });

  stdout(`OpenSocial page created at ${summary.projectDir}`);
  stdout('Back up private/identity.private.jwk.json. If you lose it, you lose the ability to publish new posts for this identity.');
  stdout('Next: run opensocial validate, opensocial preview, then opensocial deploy.');
}

async function runPost(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const content = parsed.positionals.join(' ').trim();
  if (!content) {
    throw new Error('Write your post after the command, for example: opensocial post "Hello world"');
  }
  const projectDir = parsed.options.project ?? process.cwd();
  const feed = await addPost(projectDir, content);
  stdout(`Post signed and added. Feed now contains ${feed.posts.length} posts.`);
}

async function runValidate(
  args: string[],
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): Promise<number> {
  const parsed = parseArgs(args);
  const projectDir = parsed.options.project ?? process.cwd();
  const validation = await validateProject(projectDir);

  if (!validation.valid) {
    stderr(`OpenSocial validation failed:\n${validation.failures.map((failure) => `- ${failure}`).join('\n')}`);
    return 1;
  }

  stdout(`OpenSocial page is valid. Verified ${validation.verifiedPosts} signed posts.`);
  return 0;
}

async function runPreview(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const projectDir = parsed.options.project ?? process.cwd();
  const port = Number(parsed.options.port ?? 4173);
  const preview = await createPreviewServer(projectDir, { port });

  stdout(`OpenSocial preview running at ${preview.url}`);
  stdout('Press Ctrl+C to stop.');
}

async function runDeploy(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const projectDir = parsed.options.project ?? process.cwd();
  const target = parsed.options.target ? normalizeTarget(parsed.options.target) : undefined;
  const result = await deployProject(projectDir, { target });
  stdout(
    result.url
      ? `OpenSocial page deployed to ${result.url}`
      : `OpenSocial page deployed to ${result.target}.`,
  );
}

function parseArgs(args: string[]): { positionals: string[]; options: Record<string, string> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        options[key] = 'true';
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, options };
}

function isCommand(value: string | undefined): value is string {
  return Boolean(
    value &&
      ['init', 'post', 'validate', 'preview', 'deploy', 'help', '--help', '-h'].includes(value),
  );
}

function normalizeTarget(value: string): DeployTarget {
  if (value === 'github' || value === 'cloudflare') {
    return value;
  }
  throw new Error('Deploy target must be github or cloudflare.');
}

async function prompt(question: string, defaultValue: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(`${question}${defaultValue ? ` (${defaultValue})` : ''}: `);
    return answer.trim() || defaultValue;
  } finally {
    readline.close();
  }
}

function helpText(): string {
  return `OpenSocial CLI

Usage:
  opensocial init [folder]
  opensocial post "Your post" --project ./my-page
  opensocial validate --project ./my-page
  opensocial preview --project ./my-page --port 4173
  opensocial deploy --project ./my-page --target github
  opensocial deploy --project ./my-page --target cloudflare

Run opensocial with no command to start the guided setup.`;
}
