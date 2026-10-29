import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // config.ts validates these at import time; set them here so tests never depend on the developer's .env.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-not-for-production',
      OTP_TTL_MIN: '5',
    },
    restoreMocks: true,
  },
});
