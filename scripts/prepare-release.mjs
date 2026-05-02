import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const nextVersion = process.argv[2];

if (!nextVersion) {
  throw new Error("Missing next release version argument.");
}

const pluginCfgPath = path.join(root, "plugin.cfg");
const packageJsonPath = path.join(root, "package.json");
const servicePackageJsonPath = path.join(root, "service", "package.json");

function updatePluginCfg() {
  const current = fs.readFileSync(pluginCfgPath, "utf-8");
  const updated = current.replace(/^VERSION=.*$/m, `VERSION=${nextVersion}`);
  if (updated === current) {
    throw new Error("Could not update VERSION in plugin.cfg");
  }
  fs.writeFileSync(pluginCfgPath, updated, "utf-8");
}

function updatePackageJson(filePath = packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  packageJson.version = nextVersion;
  fs.writeFileSync(filePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");
}

updatePluginCfg();
updatePackageJson(packageJsonPath);
updatePackageJson(servicePackageJsonPath);
console.log(
  `Prepared release version ${nextVersion} in plugin.cfg, package.json, and service/package.json.`,
);
