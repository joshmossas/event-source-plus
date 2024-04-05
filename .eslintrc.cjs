/**
 * @type {import("eslint").ESLint.ConfigData}
 */
module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    ignorePatterns: ["dist/*", "node_modules/*", "**/*.json"],
    extends: ["love", "prettier"],
    overrides: [
        {
            env: {
                node: true,
            },
            files: [".eslintrc.{js,cjs}"],
            parserOptions: {
                sourceType: "script",
            },
        },
    ],
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
    rules: {
        "@typescript-eslint/explicit-function-return-type": 0,
        "@typescript-eslint/return-await": 0,
        "promise/param-names": 0,
    },
};
