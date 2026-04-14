import p5Source from "p5/lib/p5.min.js?raw";

export function buildSrcdoc(userCode: string): string {
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
