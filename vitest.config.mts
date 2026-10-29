import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'scripts/**/*.test.ts',
      'site/**/*.test.ts',
      'src/**/*.test.ts',
      'fixtures/**/*.test.ts',
    ],
  },
});
