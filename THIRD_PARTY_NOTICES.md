# Third-party notices

P5JS Studio code is MIT-licensed. Third-party libraries retain their own licenses.

- p5.js 1.11.13 and 2.3.4: LGPL-2.1, Processing Foundation and contributors. Installed from npm packages `p5` and the pinned `p5-v2` alias. Sources: https://github.com/processing/p5.js and the matching package releases. Licenses are in each package's `license.txt`.
- The 1.x p5.sound bundle comes from `p5/lib/addons/p5.sound.min.js`, with the package's license and upstream attribution preserved in its source.
- The 2.x-compatible p5.sound 0.4.1 bundle is vendored unchanged from npm `p5.sound@0.4.1`, file `dist/p5.sound.min.js`. Source: https://github.com/processing/p5.js-sound. Its LGPL-2.1 license is copied to `src/vendor/p5-sound-0.4.1/LICENSE`. The bundle retains upstream notices including its audio dependencies. SHA-256: `a1ab1dcac4b5cfa68c077fee2a8d43deb630d20498fc3f54f56c9ee90ab7d5b1`.
- React, CodeMirror, Tauri, Vite, Prettier and other npm/Cargo dependencies retain their upstream license files. Consult package-lock.json and Cargo.lock for exact resolved versions.

To reproduce the vendored audio bundle, run `npm pack p5.sound@0.4.1` in a temporary directory, extract the archive, and compare `package/dist/p5.sound.min.js` with the committed file. The npm package's documentation generator dependencies are not required to run the compiled bundle, so the runtime bundle is included directly.

The examples under `examples/` are repository demo code and newly generated sample SVG/WAV assets. The earlier UI screenshot under `docs/images/` shows a sketch attributed in the screenshot to Juan Carlos Ponce Campuzano. That sketch is not included in the new example ZIPs.
