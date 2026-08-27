// Shared Jest preset for Node/NestJS unit tests.
// A service's package.json "jest" block should spread this:
//   "jest": { "preset": "../../libs/config/jest-node.preset.cjs", "rootDir": "src" }
// Note: NODE_OPTIONS=--experimental-vm-modules must still be set in each service's own
// npm test scripts — required by Prisma 7's WASM client, not something a Jest preset can set.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  testEnvironment: 'node',
};
