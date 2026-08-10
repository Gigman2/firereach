// jest-expo's preset only routes .ts/.tsx/.js/.jsx through babel-jest, so an
// unmodified .mjs import fails to parse ("Cannot use import statement outside
// a module"). Reuse that same babel-jest transform for .mjs rather than
// hand-rolling a second babel config — Jest merges `transform` keys from the
// preset and this file, so this only adds a rule instead of replacing them.
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
