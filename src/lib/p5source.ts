import p5Source from "p5/lib/p5.min.js?raw";

type SketchAssets = Record<string, string>;

export function buildSrcdoc(userCode: string, assets: SketchAssets = {}): string {
  const assetJson = JSON.stringify(assets).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #1a1a1a; }
    canvas { display: block; }
  </style>
  <script>${p5Source}</script>
</head>
<body>
  <script>
    window.__p5studioAssets = ${assetJson};
    (function() {
      function resolveAssetPath(path) {
        if (typeof path !== 'string') return null;
        if (/^(data:|blob:|https?:)/i.test(path)) return null;

        var cleaned = path.split('#')[0].split('?')[0].replace(/^\\.\\//, '');
        return window.__p5studioAssets[path]
          || window.__p5studioAssets[cleaned]
          || window.__p5studioAssets['/' + cleaned]
          || null;
      }

      function wrapLoadImage(originalLoadImage) {
        return function(path) {
          var args = Array.prototype.slice.call(arguments);
          var mapped = resolveAssetPath(path);
          if (mapped) args[0] = mapped;
          return originalLoadImage.apply(this, args);
        };
      }

      if (window.p5 && window.p5.prototype && typeof window.p5.prototype.loadImage === 'function') {
        window.p5.prototype.loadImage = wrapLoadImage(window.p5.prototype.loadImage);
      }
      if (typeof window.loadImage === 'function') {
        window.loadImage = wrapLoadImage(window.loadImage);
      }
    })();

    window.onerror = function(msg, _src, line) {
      document.body.style.background = '#1a1a1a';
      document.body.innerHTML =
        '<pre style="color:#ff6b6b;padding:16px;font-size:13px;font-family:monospace;white-space:pre-wrap;">'
        + msg + '\\n(line ' + line + ')'
        + '</pre>';
      return true;
    };
    ${userCode}
    // Auto-capture canvas thumbnail after 1.5s and send to parent
    setTimeout(function() {
      try {
        var c = document.querySelector('canvas');
        if (c) {
          window.parent.postMessage(
            { type: 'p5studio_thumbnail', data: c.toDataURL('image/png') },
            '*'
          );
        }
      } catch(e) {}
    }, 1500);
  </script>
</body>
</html>`;
}
