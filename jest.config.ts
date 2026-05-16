import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/modules/auth/**/*.ts',
    'src/middleware/**/*.ts',
    '!src/**/*.d.ts',
  ],
  // setupFilesAfterFramework: [],
  testTimeout: 30_000,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
}

export default config
