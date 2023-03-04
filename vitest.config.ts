import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/extend-expect'],
  },
})
