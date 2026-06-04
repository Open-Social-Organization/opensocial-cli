import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  addComment,
  addPost,
  addReaction,
  createDirectMessage,
  createProject,
  importDirectMessage,
  readDirectMessage,
} from './project.js';
import { validateProject } from './validate.js';
import { createPreviewServer } from './preview.js';
import { deployProject } from './deploy.js';
import type { DeployTarget, OpenSocialNetworkReaction } from './types.js';

export interface CliIO {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export async function runCli(args: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((line: string) => console.log(line));
  const stderr = io.stderr ?? ((line: string) => console.error(line));
  const [commandOrPath, ...rest] = args;
  const rawCommand = isCommand(commandOrPath) ? commandOrPath : 'init';
  const command = normalizeCommand(rawCommand);
  const commandArgs = command === 'init' && commandOrPath && !isCommand(commandOrPath) ? args : rest;

  try {
    switch (command) {
      case 'init':
        await runInit(commandArgs, stdout);
        return 0;
      case 'post':
        await runPost(commandArgs, stdout);
        return 0;
      case 'react':
        await runReact(commandArgs, stdout);
        return 0;
      case 'comment':
        await runComment(commandArgs, stdout);
        return 0;
      case 'message':
        await runMessage(commandArgs, stdout);
        return 0;
      case 'read-message':
        await runReadMessage(commandArgs, stdout);
        return 0;
      case 'import-message':
        await runImportMessage(commandArgs, stdout);
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
    stderr(error instanceof Error ? error.message : 'Open Social Network CLI failed.');
    return 1;
  }
}

async function runInit(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const targetDir = parsed.positionals[0] ?? (await prompt('Project folder', 'my-open-social-network-page'));
  const name = parsed.options.name ?? (await prompt('What should your page be called?', 'Open Social Network Founder'));
  const handle = parsed.options.handle ?? (await prompt('Choose a handle', 'founder@example.com'));
  const bio =
    parsed.options.bio ??
    (await prompt('Short bio', 'Publishing my Open Social Network page on the open web.'));
  const website = parsed.options.website ?? (await prompt('Website URL', ''));
  const baseUrl = parsed.options['base-url'] ?? (await prompt('Public base URL, if known', ''));
  const deployTarget = normalizeTarget(
    parsed.options.target ?? (await prompt('Where do you want to publish? github, cloudflare, or folder', 'folder')),
  );
  const firstPost =
    parsed.options['first-post'] ??
    (await prompt('Write your first post', 'Hello from my Open Social Network page.'));
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

  stdout(`Open Social Network page created at ${summary.projectDir}`);
  stdout('Back up private/identity.private.jwk.json. If you lose it, you lose the ability to publish new posts for this identity.');
  stdout('Next: run open-social-network check, open-social-network preview, then open-social-network publish.');
  stdout('You can host the public folder anywhere that supports static websites.');
}

async function runPost(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const content = parsed.positionals.join(' ').trim();
  if (!content) {
    throw new Error('Write your post after the command, for example: open-social-network post "Hello world"');
  }
  const projectDir = parsed.options.project ?? process.cwd();
  const feed = await addPost(projectDir, content);
  stdout(`Post signed and added. Feed now contains ${feed.posts.length} posts.`);
}

async function runReact(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const reaction = normalizeReaction(parsed.positionals[0]);
  const projectDir = parsed.options.project ?? process.cwd();
  const postId = requireOption(parsed.options, 'post', 'Choose the post id with --post post_001.');
  const author = requireOption(parsed.options, 'author', 'Choose the post author with --author person@example.com.');

  await addReaction(projectDir, {
    reaction,
    postId,
    author,
    url: parsed.options.url,
  });

  stdout('Reaction signed and saved.');
  stdout('Publish the activity update so compatible aggregators can read it.');
}

async function runComment(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const content = parsed.positionals.join(' ').trim();
  if (!content) {
    throw new Error('Write your comment after the command, for example: open-social-network comment "Great post"');
  }

  const projectDir = parsed.options.project ?? process.cwd();
  const postId = requireOption(parsed.options, 'post', 'Choose the post id with --post post_001.');
  const author = requireOption(parsed.options, 'author', 'Choose the post author with --author person@example.com.');

  await addComment(projectDir, {
    content,
    postId,
    author,
    url: parsed.options.url,
  });

  stdout('Comment signed and saved.');
  stdout('Publish the activity update so compatible aggregators can read it.');
}

async function runMessage(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const content = parsed.positionals.join(' ').trim();
  if (!content) {
    throw new Error('Write your message after the command, for example: open-social-network message "Hi" --to ./their-page');
  }

  const projectDir = parsed.options.project ?? process.cwd();
  const recipient = requireOption(
    parsed.options,
    'to',
    'Choose who should receive it with --to ./their-page or --to https://their.page/.',
  );
  const summary = await createDirectMessage(projectDir, {
    content,
    recipient,
    outputPath: parsed.options.output,
  });

  stdout(`Encrypted message saved to ${summary.outputPath}`);
  stdout(`Send this file to ${summary.recipient.name || summary.recipient.handle}.`);
  stdout('Only that page can read the message.');
}

async function runReadMessage(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const messagePath = parsed.positionals[0]?.trim();
  if (!messagePath) {
    throw new Error(
      'Choose a message file, for example: open-social-network read-message ./message.json --from ./their-page',
    );
  }

  const projectDir = parsed.options.project ?? process.cwd();
  const sender = requireOption(
    parsed.options,
    'from',
    'Choose who sent it with --from ./their-page or --from https://their.page/.',
  );
  const summary = await readDirectMessage(projectDir, { messagePath, sender });

  stdout(`From ${summary.sender.name || summary.sender.handle}`);
  stdout(`To ${summary.recipient.name || summary.recipient.handle}`);
  stdout(`Sent ${summary.createdAt}`);
  stdout('');
  stdout(summary.content);
}

async function runImportMessage(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const messagePath = parsed.positionals[0]?.trim();
  if (!messagePath) {
    throw new Error(
      'Choose a message file, for example: open-social-network import-message ./message.json --from ./their-page',
    );
  }

  const projectDir = parsed.options.project ?? process.cwd();
  const sender = requireOption(
    parsed.options,
    'from',
    'Choose who sent it with --from ./their-page or --from https://their.page/.',
  );
  const summary = await importDirectMessage(projectDir, { messagePath, sender });

  stdout(`From ${summary.sender.name || summary.sender.handle}`);
  stdout('');
  stdout(summary.content);
  stdout('');
  stdout(
    summary.added
      ? 'Message saved to public encrypted inbox.'
      : 'Message was already in the public encrypted inbox.',
  );
  stdout('Only encrypted message data is stored in public/.');
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
    stderr(`Open Social Network validation failed:\n${validation.failures.map((failure) => `- ${failure}`).join('\n')}`);
    return 1;
  }

  stdout(`Open Social Network page is valid. Verified ${validation.verifiedPosts} signed posts.`);
  return 0;
}

async function runPreview(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const projectDir = parsed.options.project ?? process.cwd();
  const port = Number(parsed.options.port ?? 4173);
  const preview = await createPreviewServer(projectDir, { port });

  stdout(`Open Social Network preview running at ${preview.url}`);
  stdout('Press Ctrl+C to stop.');
}

async function runDeploy(args: string[], stdout: (line: string) => void): Promise<void> {
  const parsed = parseArgs(args);
  const projectDir = parsed.options.project ?? process.cwd();
  const target = parsed.options.target ? normalizeTarget(parsed.options.target) : undefined;
  const result = await deployProject(projectDir, { target, outputDir: parsed.options.output });
  if (result.url) {
    stdout(`Open Social Network page deployed to ${result.url}`);
    return;
  }

  if (result.outputDir) {
    stdout(`Public site exported to ${result.outputDir}`);
    stdout('You can host the public folder anywhere that supports static websites.');
    return;
  }

  stdout(`Open Social Network page deployed to ${result.target}.`);
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
      [
        'init',
        'create',
        'post',
        'react',
        'comment',
        'message',
        'read-message',
        'open-message',
        'import-message',
        'receive-message',
        'validate',
        'check',
        'preview',
        'deploy',
        'publish',
        'help',
        '--help',
        '-h',
      ].includes(value),
  );
}

function normalizeReaction(value: string | undefined): OpenSocialNetworkReaction {
  if (value === 'like' || value === 'dislike' || value === 'none') {
    return value;
  }

  throw new Error('Choose a reaction: like, dislike, or none.');
}

function requireOption(options: Record<string, string>, key: string, message: string): string {
  const value = options[key]?.trim();
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function normalizeTarget(value: string): DeployTarget {
  if (value === 'github' || value === 'cloudflare' || value === 'folder') {
    return value;
  }
  throw new Error('Publish target must be github, cloudflare, or folder.');
}

function normalizeCommand(command: string): string {
  if (command === 'create') {
    return 'init';
  }

  if (command === 'check') {
    return 'validate';
  }

  if (command === 'publish') {
    return 'deploy';
  }

  if (command === 'open-message') {
    return 'read-message';
  }

  if (command === 'receive-message') {
    return 'import-message';
  }

  return command;
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
  return `Open Social Network CLI

Usage:
  open-social-network create [folder]
  open-social-network post "Your post" --project ./my-page
  open-social-network react like --post post_001 --author person@example.com --project ./my-page
  open-social-network comment "Great post" --post post_001 --author person@example.com --project ./my-page
  open-social-network message "Private hello" --to ./their-page --project ./my-page
  open-social-network read-message ./message.json --from ./their-page --project ./my-page
  open-social-network import-message ./message.json --from ./their-page --project ./my-page
  open-social-network check --project ./my-page
  open-social-network preview --project ./my-page --port 4173
  open-social-network publish --project ./my-page --target folder --output ./public-site
  open-social-network publish --project ./my-page --target github
  open-social-network publish --project ./my-page --target cloudflare

Run open-social-network with no command to start the guided setup.
You can host the public folder anywhere that supports static websites.`;
}
