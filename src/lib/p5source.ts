import p5Source from "p5/lib/p5.min.js?raw";

type SketchAssets = Record<string, string>;

export function buildSrcdoc(userCode: string, assets: SketchAssets = {}): string {
  const assetJson = JSON.stringify(assets).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { min-width: 100%; min-height: 100%; }
    body { overflow: auto; background: #1a1a1a; }
    canvas { display: block; }
  </style>
  <script>
    (function() {
      function stringifyDebugValue(value) {
        if (value instanceof Error) {
          return value.stack || value.message;
        }
        if (typeof value === 'string') {
          return value;
        }
        try {
          return JSON.stringify(value);
        } catch(e) {
          return String(value);
        }
      }

      window.__p5studioDebug = function(level, args, line, column) {
        try {
          window.parent.postMessage(
            {
              type: 'p5studio_debug',
              level: level,
              message: Array.prototype.slice.call(args).map(stringifyDebugValue).join(' '),
              line: line,
              column: column
            },
            '*'
          );
        } catch(e) {}
      };

      ['log', 'warn', 'error'].forEach(function(level) {
        var original = console[level];
        console[level] = function() {
          window.__p5studioDebug(level, arguments);
          if (typeof original === 'function') {
            original.apply(console, arguments);
          }
        };
      });
    })();
    window.onerror = function(msg, _src, line, column, error) {
      window.__p5studioDebug('error', [error || msg], line, column);
      document.body.style.background = '#1a1a1a';
      document.body.innerHTML =
        '<pre style="color:#ff6b6b;padding:16px;font-size:13px;font-family:monospace;white-space:pre-wrap;">'
        + msg + '\\n(line ' + line + (column ? ', column ' + column : '') + ')'
        + '</pre>';
      return true;
    };
    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason || 'Unhandled promise rejection';
      window.__p5studioDebug('error', [reason]);
    });
    window.addEventListener('message', function(event) {
      if (!event.data || event.data.type !== 'p5studio_preview_scale') return;
      var scale = Number(event.data.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      document.documentElement.style.setProperty('zoom', String(scale));
    });
  </script>
  <script>${p5Source}</script>
  <script>
    if (window.p5) {
      window.p5.disableFriendlyErrors = true;
    }
  </script>
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

  </script>
  <script>
    ${userCode}
  </script>
  <script>
    (function() {
      function wrapSketchFunction(name) {
        var original = window[name];
        if (typeof original !== 'function') return;
        window[name] = function() {
          try {
            return original.apply(this, arguments);
          } catch (error) {
            window.__p5studioDebug('error', [error]);
            throw error;
          }
        };
      }

      [
        'preload',
        'setup',
        'draw',
        'windowResized',
        'mousePressed',
        'mouseReleased',
        'mouseClicked',
        'mouseDragged',
        'keyPressed',
        'keyReleased',
        'keyTyped',
        'touchStarted',
        'touchMoved',
        'touchEnded'
      ].forEach(wrapSketchFunction);
    })();
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
