import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../cli-runner.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('runCli', () => {
  it('initializes, posts, and validates using command arguments', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');
    const output: string[] = [];

    expect(
      await runCli(
        [
          'init',
          projectDir,
          '--name',
          'Ada Lovelace',
          '--handle',
          'ada@example.com',
          '--first-post',
          'Hello from the CLI.',
          '--target',
          'github',
        ],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);
    expect(await runCli(['post', 'A second post.', '--project', projectDir], {})).toBe(0);
    expect(await runCli(['validate', '--project', projectDir], {})).toBe(0);

    const feed = JSON.parse(await readFile(join(projectDir, 'public/feed.json'), 'utf8'));
    expect(feed.posts).toHaveLength(2);
    expect(output.join('\n')).toContain('Back up private/identity.private.jwk.json');
  });

  it('supports human-friendly aliases for create, check, and publish', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');
    const exportDir = join(root, 'site-export');
    const output: string[] = [];

    expect(
      await runCli(
        [
          'create',
          projectDir,
          '--name',
          'Ada Lovelace',
          '--handle',
          'ada@example.com',
          '--first-post',
          'Hello from the CLI.',
          '--target',
          'folder',
        ],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);
    expect(await runCli(['post', 'A second post.', '--project', projectDir], {})).toBe(0);
    expect(await runCli(['check', '--project', projectDir], {})).toBe(0);
    expect(
      await runCli(['publish', '--project', projectDir, '--target', 'folder', '--output', exportDir], {
        stdout: (line) => output.push(line),
        stderr: (line) => output.push(line),
      }),
    ).toBe(0);

    expect(JSON.parse(await readFile(join(exportDir, 'feed.json'), 'utf8')).posts).toHaveLength(2);
    await expect(readFile(join(exportDir, 'private/identity.private.jwk.json'), 'utf8')).rejects.toThrow();
    expect(output.join('\n')).toContain('host the public folder anywhere');
  });

  it('adds signed portable reactions and comments with simple commands', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');
    const output: string[] = [];

    await runCli(
      [
        'create',
        projectDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from the CLI.',
      ],
      {},
    );

    expect(
      await runCli(
        ['react', 'like', '--post', 'post_001', '--author', 'ben@example.com', '--project', projectDir],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);
    expect(
      await runCli(
        [
          'comment',
          'Portable comments should work from the CLI.',
          '--post',
          'post_001',
          '--author',
          'ben@example.com',
          '--project',
          projectDir,
        ],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);
    expect(await runCli(['check', '--project', projectDir], {})).toBe(0);

    const actionLog = JSON.parse(
      await readFile(join(projectDir, 'public/opensocial/actions/index.json'), 'utf8'),
    );

    expect(actionLog.actor).toBe('ada@example.com');
    expect(actionLog.actions).toHaveLength(2);
    expect(actionLog.actions[0]).toMatchObject({
      kind: 'reaction',
      actor: 'ada@example.com',
      reaction: 'like',
      target: {
        type: 'post',
        id: 'post_001',
        author: 'ben@example.com',
      },
      signature: {
        alg: 'ES256',
      },
    });
    expect(actionLog.actions[1]).toMatchObject({
      kind: 'comment',
      actor: 'ada@example.com',
      content: 'Portable comments should work from the CLI.',
      target: {
        type: 'post',
        id: 'post_001',
        author: 'ben@example.com',
      },
      signature: {
        alg: 'ES256',
      },
    });
    expect(output.join('\n')).toContain('Reaction signed and saved.');
    expect(output.join('\n')).toContain('Comment signed and saved.');
  });

  it('creates encrypted direct messages with a simple command', async () => {
    const root = await makeTempRoot();
    const senderDir = join(root, 'sender-page');
    const recipientDir = join(root, 'recipient-page');
    const output: string[] = [];

    await runCli(
      [
        'create',
        senderDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from Ada.',
      ],
      {},
    );
    await runCli(
      [
        'create',
        recipientDir,
        '--name',
        'Ben Franklin',
        '--handle',
        'ben@example.com',
        '--first-post',
        'Hello from Ben.',
      ],
      {},
    );

    expect(
      await runCli(
        [
          'message',
          'This should stay private.',
          '--to',
          recipientDir,
          '--project',
          senderDir,
        ],
        { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
      ),
    ).toBe(0);

    const savedLine = output.find((line) => line.startsWith('Encrypted message saved to '));
    expect(savedLine).toBeDefined();
    const savedPath = savedLine!.replace('Encrypted message saved to ', '').trim();
    const savedMessage = JSON.parse(await readFile(savedPath, 'utf8'));

    expect(savedPath).toContain(join(senderDir, 'private/messages/outbox'));
    expect(JSON.stringify(savedMessage)).not.toContain('This should stay private.');
    expect(savedMessage).toMatchObject({
      protocol: 'open-social-network',
      version: '0.1',
      kind: 'direct-message',
      sender: 'ada@example.com',
      recipient: 'ben@example.com',
      signature: {
        alg: 'ES256',
      },
      encryption: {
        alg: 'ECDH-P256-A256GCM',
      },
    });
    expect(output.join('\n')).toContain('Send this file to Ben Franklin.');
  });

  it('reads encrypted direct messages with the recipient page key', async () => {
    const root = await makeTempRoot();
    const senderDir = join(root, 'sender-page');
    const recipientDir = join(root, 'recipient-page');
    const sendOutput: string[] = [];
    const readOutput: string[] = [];

    await runCli(
      [
        'create',
        senderDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from Ada.',
      ],
      {},
    );
    await runCli(
      [
        'create',
        recipientDir,
        '--name',
        'Ben Franklin',
        '--handle',
        'ben@example.com',
        '--first-post',
        'Hello from Ben.',
      ],
      {},
    );

    await runCli(
      [
        'message',
        'This should stay private.',
        '--to',
        recipientDir,
        '--project',
        senderDir,
      ],
      { stdout: (line) => sendOutput.push(line), stderr: (line) => sendOutput.push(line) },
    );
    const savedLine = sendOutput.find((line) => line.startsWith('Encrypted message saved to '));
    const savedPath = savedLine!.replace('Encrypted message saved to ', '').trim();

    expect(
      await runCli(
        ['read-message', savedPath, '--from', senderDir, '--project', recipientDir],
        { stdout: (line) => readOutput.push(line), stderr: (line) => readOutput.push(line) },
      ),
    ).toBe(0);

    expect(readOutput.join('\n')).toContain('From Ada Lovelace');
    expect(readOutput.join('\n')).toContain('This should stay private.');
  });

  it('imports received messages into the public encrypted inbox', async () => {
    const root = await makeTempRoot();
    const senderDir = join(root, 'sender-page');
    const recipientDir = join(root, 'recipient-page');
    const sendOutput: string[] = [];
    const importOutput: string[] = [];

    await runCli(
      [
        'create',
        senderDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from Ada.',
      ],
      {},
    );
    await runCli(
      [
        'create',
        recipientDir,
        '--name',
        'Ben Franklin',
        '--handle',
        'ben@example.com',
        '--first-post',
        'Hello from Ben.',
      ],
      {},
    );

    await runCli(
      [
        'message',
        'This should stay private.',
        '--to',
        recipientDir,
        '--project',
        senderDir,
      ],
      { stdout: (line) => sendOutput.push(line), stderr: (line) => sendOutput.push(line) },
    );
    const savedLine = sendOutput.find((line) => line.startsWith('Encrypted message saved to '));
    const savedPath = savedLine!.replace('Encrypted message saved to ', '').trim();

    expect(
      await runCli(
        ['import-message', savedPath, '--from', senderDir, '--project', recipientDir],
        { stdout: (line) => importOutput.push(line), stderr: (line) => importOutput.push(line) },
      ),
    ).toBe(0);
    expect(
      await runCli(['receive-message', savedPath, '--from', senderDir, '--project', recipientDir], {}),
    ).toBe(0);

    const inbox = JSON.parse(
      await readFile(join(recipientDir, 'public/opensocial/messages/inbox/index.json'), 'utf8'),
    );

    expect(inbox.owner).toBe('ben@example.com');
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0]).toMatchObject({
      kind: 'direct-message',
      sender: 'ada@example.com',
      recipient: 'ben@example.com',
    });
    expect(JSON.stringify(inbox)).not.toContain('This should stay private.');
    expect(importOutput.join('\n')).toContain('Message saved to public encrypted inbox.');
  });

  it('fails validation after a signed action is tampered with', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await runCli(
      [
        'create',
        projectDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from the CLI.',
      ],
      {},
    );
    await runCli(
      [
        'comment',
        'Original public comment.',
        '--post',
        'post_001',
        '--author',
        'ben@example.com',
        '--project',
        projectDir,
      ],
      {},
    );

    const actionLogPath = join(projectDir, 'public/opensocial/actions/index.json');
    const actionLog = JSON.parse(await readFile(actionLogPath, 'utf8'));
    actionLog.actions[0].content = 'Tampered public comment.';
    const { writeFile } = await import('node:fs/promises');
    await writeFile(actionLogPath, `${JSON.stringify(actionLog, null, 2)}\n`, 'utf8');

    expect(await runCli(['check', '--project', projectDir], {})).toBe(1);
  });

  it('explains that any static host can publish a page', async () => {
    const output: string[] = [];

    expect(await runCli(['help'], { stdout: (line) => output.push(line) })).toBe(0);

    expect(output.join('\n')).toContain('host the public folder anywhere');
    expect(output.join('\n')).toContain('open-social-network message "Private hello"');
    expect(output.join('\n')).toContain('open-social-network read-message ./message.json');
    expect(output.join('\n')).toContain('open-social-network import-message ./message.json');
  });

  it('returns a nonzero exit code for validation failures', async () => {
    const root = await makeTempRoot();
    const projectDir = join(root, 'my-page');

    await runCli(
      [
        'init',
        projectDir,
        '--name',
        'Ada Lovelace',
        '--handle',
        'ada@example.com',
        '--first-post',
        'Hello from the CLI.',
      ],
      {},
    );
    const feedPath = join(projectDir, 'public/feed.json');
    const feed = JSON.parse(await readFile(feedPath, 'utf8'));
    feed.posts[0].content = 'Changed later.';
    const { writeFile } = await import('node:fs/promises');
    await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

    expect(await runCli(['validate', '--project', projectDir], {})).toBe(1);
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'open-social-network-cli-'));
  tempRoots.push(root);
  return root;
}
