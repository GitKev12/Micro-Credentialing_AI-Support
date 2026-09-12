process.env.NODE_ENV = "test";

/**
 * Jest across the two workspaces.
 *
 * Both packages are `"type": "module"`, so the suites run as real ESM — the
 * `test` script sets --experimental-vm-modules for that. The consequence worth
 * knowing: in ESM mode Jest does not inject globals, so every test file imports
 * `describe`/`it`/`expect` from `@jest/globals` rather than relying on them
 * being in scope.
 *
 * Two projects rather than one, because the halves need different environments:
 * the server is plain Node, and the client needs a DOM to render into.
 */
export default {
  projects: [
    {
      displayName: "server",
      testEnvironment: "node",
      testMatch: ["<rootDir>/server/tests/**/*.test.js"],
      // Nothing to compile: the server is ESM Node already.
      transform: {}
    },
    {
      displayName: "client",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/client/tests/**/*.test.{js,jsx}"],
      setupFilesAfterEnv: ["<rootDir>/client/tests/setup.js"],
      // `.js` is already ESM here (the package is "type": "module"), but Jest
      // does not extend that to `.jsx` on its own.
      extensionsToTreatAsEsm: [".jsx"],
      // JSX is the only thing Babel is here for. No preset-env, so import/export
      // pass through untouched and the files stay ESM for Jest's ESM runtime.
      transform: {
        "^.+\.jsx?$": ["babel-jest", { presets: [["@babel/preset-react", { runtime: "automatic" }]] }]
      },
      // Components pull in stylesheets that mean nothing to a test.
      moduleNameMapper: {
        "\.(css|less|scss)$": "<rootDir>/client/tests/styleStub.js"
      }
    }
  ]
};
