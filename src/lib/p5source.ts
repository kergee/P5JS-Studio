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

      function mapAssetPath(value) {
        if (Array.isArray(value)) {
          return value.map(function(item) {
            return resolveAssetPath(item) || item;
          });
        }
        return resolveAssetPath(value) || value;
      }

      function extensionFromPath(path) {
        if (typeof path !== 'string') return '';
        var cleaned = path.split('#')[0].split('?')[0];
        var match = cleaned.match(/\\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : '';
      }

      function wrapAssetLoader(originalLoader) {
        return function(path) {
          var args = Array.prototype.slice.call(arguments);
          args[0] = mapAssetPath(path);
          return originalLoader.apply(this, args);
        };
      }

      function wrapTableLoader(originalLoader) {
        return function(path) {
          var args = Array.prototype.slice.call(arguments);
          var extension = extensionFromPath(path);
          args[0] = mapAssetPath(path);
          if ((extension === 'csv' || extension === 'tsv') && args[1] !== 'csv' && args[1] !== 'tsv') {
            args.splice(1, 0, extension);
          }
          return originalLoader.apply(this, args);
        };
      }

      function wrapModelLoader(originalLoader) {
        return function(path) {
          var args = Array.prototype.slice.call(arguments);
          var extension = extensionFromPath(path);
          args[0] = mapAssetPath(path);
          if ((extension === 'obj' || extension === 'stl') && !args.some(function(arg) { return arg === 'obj' || arg === 'stl'; })) {
            args[4] = extension;
          }
          return originalLoader.apply(this, args);
        };
      }

      function wrapShaderLoader(originalLoader) {
        return function(vertexPath, fragmentPath) {
          var args = Array.prototype.slice.call(arguments);
          args[0] = mapAssetPath(vertexPath);
          args[1] = mapAssetPath(fragmentPath);
          return originalLoader.apply(this, args);
        };
      }

      function wrapNamedLoader(target, name, wrapper) {
        if (target && typeof target[name] === 'function') {
          target[name] = wrapper(target[name]);
        }
      }

      var singlePathLoaders = [
        'loadImage',
        'loadFont',
        'loadJSON',
        'loadStrings',
        'loadXML',
        'loadBytes',
        'loadSound',
        'createImg',
        'createVideo',
        'createAudio'
      ];

      singlePathLoaders.forEach(function(name) {
        wrapNamedLoader(window.p5 && window.p5.prototype, name, wrapAssetLoader);
        wrapNamedLoader(window, name, wrapAssetLoader);
      });

      ['loadTable'].forEach(function(name) {
        wrapNamedLoader(window.p5 && window.p5.prototype, name, wrapTableLoader);
        wrapNamedLoader(window, name, wrapTableLoader);
      });

      ['loadModel'].forEach(function(name) {
        wrapNamedLoader(window.p5 && window.p5.prototype, name, wrapModelLoader);
        wrapNamedLoader(window, name, wrapModelLoader);
      });

      ['loadShader'].forEach(function(name) {
        wrapNamedLoader(window.p5 && window.p5.prototype, name, wrapShaderLoader);
        wrapNamedLoader(window, name, wrapShaderLoader);
      });
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
    // Auto-capture a compact canvas thumbnail after 1.5s and send to parent.
    setTimeout(function() {
      try {
        var c = document.querySelector('canvas');
        if (c) {
          var maxSize = 320;
          var scale = Math.min(1, maxSize / Math.max(c.width, c.height));
          var width = Math.max(1, Math.round(c.width * scale));
          var height = Math.max(1, Math.round(c.height * scale));
          var thumb = document.createElement('canvas');
          thumb.width = width;
          thumb.height = height;
          var ctx = thumb.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(c, 0, 0, width, height);
          var imageData = ctx.getImageData(0, 0, width, height);
          var data = imageData.data;
          var step = 17; // 4 bits per color channel, still encoded as browser PNG.
          for (var i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / step) * step;
            data[i + 1] = Math.round(data[i + 1] / step) * step;
            data[i + 2] = Math.round(data[i + 2] / step) * step;
            data[i + 3] = Math.round(data[i + 3] / step) * step;
          }
          ctx.putImageData(imageData, 0, 0);
          window.parent.postMessage(
            { type: 'p5studio_thumbnail', data: thumb.toDataURL('image/png') },
            '*'
          );
        }
      } catch(e) {}
    }, 1500);
  </script>
</body>
</html>`;
}
