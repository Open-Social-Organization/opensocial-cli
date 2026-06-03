import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { publicDir } from './paths.js';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

export interface PreviewServer {
  url: string;
  server: Server;
  close(): Promise<void>;
}

export async function createPreviewServer(
  projectDir: string,
  options: { port: number; host?: string },
): Promise<PreviewServer> {
  const root = publicDir(projectDir);
  const host = options.host ?? '127.0.0.1';
  const server = createServer((request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
    const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(root, safePath === '/' ? 'index.html' : safePath);
    const finalPath = existsSync(filePath) ? filePath : join(root, 'index.html');
    const extension = extname(finalPath);

    response.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream');
    createReadStream(finalPath).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    url: `http://${host}:${port}`,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
