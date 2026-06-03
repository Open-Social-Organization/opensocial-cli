import { spawn } from 'node:child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  cwd?: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string; input?: string },
) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (command, args, options = {}) => {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      resolve({ code: 127, stdout, stderr: error.message, cwd: options.cwd });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr, cwd: options.cwd });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
};

export async function requireCommand(
  command: string,
  guidance: string,
  runner: CommandRunner,
): Promise<void> {
  const result = await runner(command, ['--version']);
  if (result.code !== 0) {
    throw new Error(guidance);
  }
}

export async function requireSuccessful(
  command: string,
  args: string[],
  runner: CommandRunner,
  options: { cwd?: string; input?: string; guidance?: string } = {},
): Promise<CommandResult> {
  const result = await runner(command, args, options);
  if (result.code !== 0) {
    throw new Error(options.guidance || result.stderr || `${command} ${args.join(' ')} failed`);
  }
  return result;
}
