import p5v1 from "p5/lib/p5.min.js?raw";
import soundv1 from "p5/lib/addons/p5.sound.min.js?raw";
import p5v2 from "../../node_modules/p5-v2/lib/p5.min.js?raw";
import soundv2 from "../vendor/p5-sound-0.4.1/p5.sound.min.js?raw";
import { getRuntime } from "./runtimes";

export function getRuntimeSources(version: string) {
  const descriptor = getRuntime(version);
  if (!descriptor) throw new Error(`p5.js ${version} is not installed. Select an available version.`);
  return descriptor.major === 1 ? { source: p5v1, sound: soundv1 } : { source: p5v2, sound: soundv2 };
}
