import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
    entries: [{ input: "./src/_index.ts", name: "index" }],
    outDir: "dist",
    declaration: true,
    clean: true,
    rollup: {
        emitCJS: true,
        dts: {
            respectExternal: true,
        },
    },
});
