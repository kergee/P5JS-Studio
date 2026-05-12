import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";

export const p5Completions: Completion[] = [
  {
    label: "setup",
    type: "function",
    detail: "p5 lifecycle",
    info: "Runs once when the sketch starts.",
    apply: "function setup() {\n  createCanvas(900, 600);\n}\n",
  },
  {
    label: "draw",
    type: "function",
    detail: "p5 lifecycle",
    info: "Runs continuously after setup().",
    apply: "function draw() {\n  background(0);\n}\n",
  },
  {
    label: "preload",
    type: "function",
    detail: "p5 lifecycle",
    info: "Load images, fonts, sounds, or other assets before setup().",
    apply: "function preload() {\n  \n}\n",
  },
  {
    label: "windowResized",
    type: "function",
    detail: "p5 lifecycle",
    info: "Runs when the preview window changes size.",
    apply: "function windowResized() {\n  resizeCanvas(windowWidth, windowHeight);\n}\n",
  },
  { label: "createCanvas", type: "function", detail: "(width, height)" },
  { label: "resizeCanvas", type: "function", detail: "(width, height)" },
  { label: "background", type: "function", detail: "(gray | r, g, b, [alpha])" },
  { label: "fill", type: "function", detail: "(gray | r, g, b, [alpha])" },
  { label: "stroke", type: "function", detail: "(gray | r, g, b, [alpha])" },
  { label: "noFill", type: "function", detail: "()" },
  { label: "noStroke", type: "function", detail: "()" },
  { label: "strokeWeight", type: "function", detail: "(weight)" },
  { label: "rect", type: "function", detail: "(x, y, width, height)" },
  { label: "ellipse", type: "function", detail: "(x, y, width, [height])" },
  { label: "circle", type: "function", detail: "(x, y, diameter)" },
  { label: "line", type: "function", detail: "(x1, y1, x2, y2)" },
  { label: "point", type: "function", detail: "(x, y)" },
  { label: "triangle", type: "function", detail: "(x1, y1, x2, y2, x3, y3)" },
  { label: "quad", type: "function", detail: "(x1, y1, x2, y2, x3, y3, x4, y4)" },
  { label: "arc", type: "function", detail: "(x, y, width, height, start, stop)" },
  { label: "text", type: "function", detail: "(value, x, y)" },
  { label: "textSize", type: "function", detail: "(size)" },
  { label: "textAlign", type: "function", detail: "(horizontal, [vertical])" },
  { label: "image", type: "function", detail: "(img, x, y, [width], [height])" },
  { label: "loadImage", type: "function", detail: "(path)" },
  { label: "loadFont", type: "function", detail: "(path)" },
  { label: "push", type: "function", detail: "()" },
  { label: "pop", type: "function", detail: "()" },
  { label: "translate", type: "function", detail: "(x, y)" },
  { label: "rotate", type: "function", detail: "(angle)" },
  { label: "scale", type: "function", detail: "(amount)" },
  { label: "angleMode", type: "function", detail: "(RADIANS | DEGREES)" },
  { label: "rectMode", type: "function", detail: "(CORNER | CENTER)" },
  { label: "ellipseMode", type: "function", detail: "(CENTER | CORNER)" },
  { label: "random", type: "function", detail: "([min], max)" },
  { label: "noise", type: "function", detail: "(x, [y], [z])" },
  { label: "map", type: "function", detail: "(value, start1, stop1, start2, stop2)" },
  { label: "constrain", type: "function", detail: "(value, min, max)" },
  { label: "dist", type: "function", detail: "(x1, y1, x2, y2)" },
  { label: "lerp", type: "function", detail: "(start, stop, amount)" },
  { label: "color", type: "function", detail: "(gray | r, g, b, [alpha])" },
  { label: "frameRate", type: "function", detail: "([fps])" },
  { label: "saveCanvas", type: "function", detail: "([filename], [extension])" },
  { label: "mouseX", type: "variable", detail: "current mouse x" },
  { label: "mouseY", type: "variable", detail: "current mouse y" },
  { label: "pmouseX", type: "variable", detail: "previous mouse x" },
  { label: "pmouseY", type: "variable", detail: "previous mouse y" },
  { label: "width", type: "variable", detail: "canvas width" },
  { label: "height", type: "variable", detail: "canvas height" },
  { label: "windowWidth", type: "variable", detail: "preview width" },
  { label: "windowHeight", type: "variable", detail: "preview height" },
  { label: "frameCount", type: "variable", detail: "draw frame counter" },
  { label: "PI", type: "constant" },
  { label: "TWO_PI", type: "constant" },
  { label: "HALF_PI", type: "constant" },
  { label: "RADIANS", type: "constant" },
  { label: "DEGREES", type: "constant" },
  { label: "CENTER", type: "constant" },
  { label: "CORNER", type: "constant" },
];

export const p5CompletionLabels = p5Completions.map((completion) => completion.label);

function p5CompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
  if (!word) {
    return context.explicit ? { from: context.pos, options: p5Completions } : null;
  }
  if (word.from === word.to && !context.explicit) {
    return null;
  }

  return {
    from: word.from,
    options: p5Completions,
    validFor: /^[A-Za-z_$][\w$]*$/,
  };
}

export const p5CompletionExtension = javascriptLanguage.data.of({
  autocomplete: p5CompletionSource,
});
