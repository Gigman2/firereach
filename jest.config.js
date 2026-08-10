// jest-expo's preset only routes .ts/.tsx/.js/.jsx through babel-jest, so an
// unmodified .mjs import fails to parse ("Cannot use import statement outside
// a module"). Reuse that same babel-jest transform for .mjs rather than
// hand-rolling a second babel config — Jest merges `transform` keys from the
// preset and this file, so this only adds a rule instead of replacing them.
//
// This only works because the .mjs modules under app/scripts/ that Jest ever
// imports (the content-hash, content-validation, and safety-content-seed
// helpers) are pure logic with no import.meta. Files that need import.meta
// for path resolution (e.g. the safety-content-seed CLI entrypoint) run only
// via `node scripts/foo.mjs`, never imported by a test — jest-expo's preset
// targets Hermes and throws on import.meta ("not supported in Hermes") for
// any non-web caller platform, which is what it would hit if a test tried to
// import one of those directly.
const jestExpoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/lib/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json"],
  transform: {
    "\\.mjs$": jestExpoPreset.transform["\\.[jt]sx?$"],
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*))",
  ],
};
