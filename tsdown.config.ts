import { defineConfig } from "tsdown";

export default defineConfig({
    entry: [{ index: "src/_index.ts" }],
    format: ["esm", "cjs"],
    dts: true,
    outExtensions({ format }) {
        return {
            js: format === "cjs" ? ".cjs" : ".mjs",
        };
    },
});
