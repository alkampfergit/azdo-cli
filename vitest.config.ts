import { configDefaults, defineConfig } from 'vitest/config';

// Integration tests that never call Azure DevOps.
const LOCAL_INTEGRATION_TESTS = [
  'tests/integration/auth.integration.test.ts',
  'tests/integration/config-org.test.ts',
  'tests/integration/credential-store.test.ts',
];

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
          // Config and credential-store tests: no Azure DevOps access, so no
          // proxy probe.
          name: 'integration-local',
          include: LOCAL_INTEGRATION_TESTS,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...LOCAL_INTEGRATION_TESTS],
          // Probe the dev container proxy once: skip the live suites (or fail,
          // with AZDO_REQUIRE_PROXY=1) when it cannot authenticate.
          globalSetup: ['tests/integration/global-setup.ts'],
        },
      },
    ],
  },
});
