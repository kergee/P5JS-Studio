import { parse } from "@babel/parser";
import type { Diagnostic } from "@codemirror/lint";
import { linter } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { p5CompletionLabels } from "./p5Completions";

export type CodeDiagnosticLevel = "warning" | "error";

export interface CodeDiagnostic {
  level: CodeDiagnosticLevel;
  message: string;
  from?: number;
  to?: number;
  line?: number;
  column?: number;
}

type AstNode = {
  type?: string;
  start?: number | null;
  end?: number | null;
  loc?: {
    start?: { line?: number; column?: number };
  };
  [key: string]: unknown;
};

const p5GlobalCalls = new Set([
  ...p5CompletionLabels,
  "abs", "acos", "alpha", "ambientLight", "ambientMaterial", "append",
  "applyMatrix", "arrayCopy", "asin", "atan", "atan2", "beginContour",
  "beginShape", "bezier", "bezierDetail", "bezierPoint", "bezierTangent",
  "bezierVertex", "blend", "blendMode", "blue", "boolean", "box",
  "brightness", "byte", "camera", "ceil", "changed", "char", "clear",
  "clearStorage", "colorMode", "concat", "cone", "copy", "cos", "createA",
  "createAudio", "createButton", "createCamera", "createCapture",
  "createCheckbox", "createColorPicker", "createConvolver", "createDiv",
  "createElement", "createFileInput", "createFramebuffer", "createGraphics",
  "createImage", "createImg", "createInput", "createNumberDict", "createP",
  "createRadio", "createSelect", "createShader", "createSlider", "createSpan",
  "createStringDict", "createVector", "createVideo", "createWriter", "cursor",
  "curve", "curveDetail", "curvePoint", "curveTangent", "curveTightness",
  "curveVertex", "cylinder", "day", "debugMode", "degrees", "describe",
  "describeElement", "deviceMoved", "deviceShaken", "deviceTurned",
  "directionalLight", "displayDensity", "doubleClicked", "ellipseMode",
  "ellipsoid", "emissiveMaterial", "endContour", "endShape", "erase",
  "exitPointerLock", "exp", "filter", "float", "floor", "fract", "freqToMidi",
  "frustum", "fullscreen", "get", "getAudioContext", "getItem",
  "getOutputVolume", "getTargetFrameRate", "getURL", "getURLParams",
  "getURLPath", "green", "gridOutput", "hex", "hour", "httpDo", "httpGet",
  "httpPost", "hue", "imageMode", "input", "int", "isLooping", "join",
  "keyIsDown", "lerpColor", "lightFalloff", "lightness", "lights", "loadBytes",
  "loadJSON", "loadModel", "loadPixels", "loadShader", "loadSound",
  "loadStrings", "loadTable", "loadXML", "log", "loop", "mag", "match",
  "matchAll", "max", "midiToFreq", "millis", "min", "minute", "model", "month",
  "mouseWheel", "nf", "nfc", "nfp", "nfs", "noCanvas", "noCursor",
  "noDebugMode", "noErase", "noiseDetail", "noiseSeed", "noLights", "noLoop",
  "norm", "normal", "normalMaterial", "noSmooth", "noTint", "orbitControl",
  "ortho", "outputVolume", "perspective", "pixelDensity", "plane",
  "pointLight", "pow", "print", "quadraticVertex", "radians", "randomGaussian",
  "randomSeed", "redraw", "removeElements", "removeItem",
  "requestPointerLock", "resetMatrix", "resetShader", "reverse", "rotateX",
  "rotateY", "rotateZ", "round", "sampleRate", "save", "saveFrames", "saveGif",
  "saveJSON", "saveSound", "saveStrings", "saveTable", "second", "select",
  "selectAll", "set", "setAttributes", "setBPM", "setCamera",
  "setMoveThreshold", "setShakeThreshold", "shader", "shearX", "shearY",
  "shininess", "shorten", "shuffle", "sin", "smooth", "sort", "soundFormats",
  "specularColor", "specularMaterial", "sphere", "splice", "split",
  "splitTokens", "spotLight", "sq", "sqrt", "square", "storeItem", "str",
  "strokeCap", "strokeJoin", "subset", "tan", "textAscent", "textDescent",
  "textFont", "textLeading", "textOutput", "textStyle", "texture",
  "textureMode", "textureWrap", "textWidth", "textWrap", "tint", "torus",
  "trim", "unchar", "unhex", "updatePixels", "userStartAudio", "vertex",
  "vertexNormal", "year",
]);

const jsGlobalCalls = new Set([
  "Array", "ArrayBuffer", "BigInt", "Boolean", "DataView", "Date", "Error",
  "EvalError", "Float32Array", "Float64Array", "Function", "Int8Array",
  "Int16Array", "Int32Array", "JSON", "Map", "Math", "Number", "Object",
  "Promise", "Proxy", "RangeError", "ReferenceError", "Reflect", "RegExp",
  "Set", "String", "Symbol", "SyntaxError", "TypeError", "URIError",
  "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array", "WeakMap",
  "WeakSet", "alert", "cancelAnimationFrame", "clearInterval", "clearTimeout",
  "confirm", "decodeURI", "decodeURIComponent", "encodeURI",
  "encodeURIComponent", "escape", "fetch", "isFinite", "isNaN", "parseFloat",
  "parseInt", "prompt", "requestAnimationFrame", "setInterval", "setTimeout",
  "unescape",
]);

const knownCalls = new Set([...p5GlobalCalls, ...jsGlobalCalls]);

function visitNode(value: unknown, callback: (node: AstNode) => void) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => visitNode(item, callback));
    return;
  }

  const node = value as AstNode;
  if (!node.type) return;

  callback(node);

  Object.entries(node).forEach(([key, child]) => {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "leadingComments" ||
      key === "innerComments" ||
      key === "trailingComments"
    ) {
      return;
    }
    visitNode(child, callback);
  });
}

function collectPatternNames(pattern: unknown, names: Set<string>) {
  const node = pattern as AstNode | null;
  if (!node) return;

  if (node.type === "Identifier" && typeof node.name === "string") {
    names.add(node.name);
    return;
  }

  visitNode(node, (child) => {
    if (child.type === "Identifier" && typeof child.name === "string") {
      names.add(child.name);
    }
  });
}

function collectDeclaredNames(ast: AstNode) {
  const names = new Set<string>();

  visitNode(ast, (node) => {
    if (
      (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
      typeof (node.id as AstNode | undefined)?.name === "string"
    ) {
      names.add((node.id as { name: string }).name);
    }

    if (node.type === "VariableDeclarator") {
      collectPatternNames(node.id, names);
    }

    if (node.type === "AssignmentExpression") {
      collectPatternNames(node.left, names);
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      (node.params as unknown[] | undefined)?.forEach((param) => collectPatternNames(param, names));
    }

    if (node.type === "CatchClause") {
      collectPatternNames(node.param, names);
    }
  });

  return names;
}

function distance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function closestP5Call(name: string) {
  if (name.length < 3) return null;
  const withoutFirst = name.slice(1);
  if (p5GlobalCalls.has(withoutFirst)) return withoutFirst;

  let best: string | null = null;
  let bestDistance = 3;
  p5GlobalCalls.forEach((known) => {
    if (Math.abs(known.length - name.length) > 2) return;
    const score = distance(name.toLowerCase(), known.toLowerCase());
    if (score < bestDistance) {
      bestDistance = score;
      best = known;
    }
  });

  return best;
}

function syntaxPosition(code: string, line?: number, column?: number) {
  if (!line || column === undefined) return undefined;
  const lines = code.split("\n");
  return lines.slice(0, line - 1).reduce((total, item) => total + item.length + 1, 0) + column;
}

export function getJavaScriptDiagnostics(code: string): CodeDiagnostic[] {
  let ast: AstNode;

  try {
    ast = parse(code, {
      sourceType: "script",
      errorRecovery: false,
    }) as unknown as AstNode;
  } catch (error) {
    const syntaxError = error as Error & {
      loc?: { line?: number; column?: number };
      pos?: number;
    };
    const from = syntaxError.pos ?? syntaxPosition(code, syntaxError.loc?.line, syntaxError.loc?.column);
    return [
      {
        level: "error",
        message: `SyntaxError: ${syntaxError.message || "Invalid JavaScript syntax"}`,
        from,
        to: from !== undefined ? from + 1 : undefined,
        line: syntaxError.loc?.line,
        column: syntaxError.loc?.column,
      },
    ];
  }

  const declaredNames = collectDeclaredNames(ast);
  const diagnostics: CodeDiagnostic[] = [];

  visitNode(ast, (node) => {
    if (
      node.type !== "CallExpression" ||
      !(node.callee as AstNode | undefined) ||
      (node.callee as AstNode).type !== "Identifier"
    ) {
      return;
    }

    const callee = node.callee as AstNode & { name?: string };
    if (!callee.name || declaredNames.has(callee.name) || knownCalls.has(callee.name)) return;

    const suggestion = closestP5Call(callee.name);
    diagnostics.push({
      level: "warning",
      message: suggestion
        ? `"${callee.name}" is not defined. Did you mean "${suggestion}"?`
        : `"${callee.name}" is not defined.`,
      from: callee.start ?? undefined,
      to: callee.end ?? undefined,
      line: callee.loc?.start?.line,
      column: callee.loc?.start?.column,
    });
  });

  return diagnostics;
}

export const p5LintExtension = linter((view: EditorView): Diagnostic[] => {
  const docLength = view.state.doc.length;
  return getJavaScriptDiagnostics(view.state.doc.toString()).map((diagnostic) => {
    const from = Math.min(Math.max(diagnostic.from ?? 0, 0), docLength);
    const to = Math.min(Math.max(diagnostic.to ?? from + 1, from + 1), docLength);
    return {
      from,
      to,
      severity: diagnostic.level,
      message: diagnostic.message,
    };
  });
}, { delay: 350 });
