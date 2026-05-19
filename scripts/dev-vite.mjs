import { createServer, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const args = process.argv.slice(2);
const hostArgIndex = args.indexOf('--host');
const portArgIndex = args.indexOf('--port');
const host = hostArgIndex >= 0 ? args[hostArgIndex + 1] : '127.0.0.1';
const port = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : 5173;

const server = await createServer(
  defineConfig({
    root: process.cwd(),
    configFile: false,
    plugins: [react()],
    server: {
      host,
      port,
      strictPort: true,
    },
  })
);

await server.listen();
server.printUrls();

await new Promise(() => {});
