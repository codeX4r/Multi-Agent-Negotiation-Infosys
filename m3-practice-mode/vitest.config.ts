import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000, server: { deps: { inline: [/frontend/] } } },
  server: { fs: { allow: ['..'] } },
});
