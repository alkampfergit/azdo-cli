import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          // Unit tests assert real dev.azure.com URLs; the dev container sets
          // AZDO_API_BASE_URL for the integration tests, so clear it here.
          setupFiles: ['tests/unit/setup-env.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
