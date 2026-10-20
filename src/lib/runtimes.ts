import packageV1 from "p5/package.json";
import packageV2 from "../../node_modules/p5-v2/package.json";

export const LEGACY_P5_VERSION = packageV1.version;
export const RUNTIMES = [
  { version: packageV1.version, major: 1 },
  { version: packageV2.version, major: 2 },
];
export function getRuntime(version: string) {
  return RUNTIMES.find((runtime) => runtime.version === version);
}
const DEFAULT_VERSION_KEY = "p5js-studio-default-version";
export function readDefaultVersion() {
  const stored = localStorage.getItem(DEFAULT_VERSION_KEY);
  return stored && getRuntime(stored) ? stored : LEGACY_P5_VERSION;
}
export function storeDefaultVersion(version: string) {
  if (getRuntime(version)) localStorage.setItem(DEFAULT_VERSION_KEY, version);
}
