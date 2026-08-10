// jest-expo's preset only routes .ts/.tsx/.js/.jsx through babel-jest, so an
// unmodified .mjs import fails to parse ("Cannot use import statement outside
// a module"). .mjs files in this repo are plain Node build scripts under
// app/scripts/ (not React Native app code), so — unlike the line below might
// suggest — they get their own minimal transform rather than reusing
// jest-expo's Hermes-targeted preset: that preset throws on `import.meta`
// ("not supported in Hermes") for any non-web caller platform, and the
// caller jest-expo passes is always platform "ios". The dedicated transform
// here only lowers ESM import/export to CommonJS and rewrites import.meta.url
// (see jest/babel-plugin-transform-import-meta-url.js) — everything else in
// these scripts is plain modern JS that Node already executes natively.
const jestExpoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/lib/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json"],
  transform: {
    "\\.mjs$": [
      "babel-jest",
      {
        babelrc: false,
        configFile: false,
        sourceType: "module",
        plugins: [
          "@babel/plugin-transform-modules-commonjs",
          require.resolve("./jest/babel-plugin-transform-import-meta-url.js"),
        ],
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*))",
  ],
};
