import { fileURLToPath } from "node:url";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";
import { build } from "esbuild";

const absWorkingDir = fileURLToPath(new URL(".", import.meta.url));
const { esbuild } = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });

await Promise.all(Object.values(esbuild).map((options) => build({ ...options, absWorkingDir })));
