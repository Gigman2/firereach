/**
 * Jest-only Babel plugin: makes `import.meta.url` evaluate sensibly when a
 * build script under app/scripts/*.mjs is pulled into a Jest test via
 * require() (CommonJS), instead of run directly via `node scripts/foo.mjs`
 * (native ESM, where import.meta.url is well defined by the platform).
 *
 * jest-expo's babel preset can't be reused for this: it targets Hermes and
 * throws ("import.meta is not supported in Hermes") for any non-web caller
 * platform, which is exactly the caller jest.config.js's existing transform
 * passes. These build scripts are plain Node tooling, not React Native app
 * code, so they don't need — and can't tolerate — that preset.
 *
 * Rewrites `import.meta` to `{ url: require("url").pathToFileURL(__filename).href }`,
 * so `import.meta.url` resolves to the real file:// URL of the module Jest is
 * currently executing.
 */
module.exports = function transformImportMetaUrl({ types: t }) {
  return {
    name: "transform-import-meta-url",
    visitor: {
      MetaProperty(path) {
        const { node } = path;
        if (node.meta.name !== "import" || node.property.name !== "meta") return;

        path.replaceWith(
          t.objectExpression([
            t.objectProperty(
              t.identifier("url"),
              t.memberExpression(
                t.callExpression(
                  t.memberExpression(
                    t.callExpression(t.identifier("require"), [t.stringLiteral("url")]),
                    t.identifier("pathToFileURL")
                  ),
                  [t.identifier("__filename")]
                ),
                t.identifier("href")
              )
            ),
          ])
        );
      },
    },
  };
};
