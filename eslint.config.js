import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
    {
        files: ["**/*.ts"],
        ignores: ["coverage", "dist", "node_modules"],
    },
    eslint.configs.recommended,
    ...tsEslint.configs.recommended,
    {
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            "simple-import-sort/imports": 2,
            "simple-import-sort/exports": 2,
            "@typescript-eslint/no-explicit-any": 0,
            "@typescript-eslint/no-unused-vars": [
                2,
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    prettier,
);
