import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration files share the seeded tenants, and a meal plan can use any recipe of the
    // tenant, so files must not overlap. Set here (not as a CLI flag) so editor runs follow it too.
    fileParallelism: false,
  },
});
