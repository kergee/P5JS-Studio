import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

// Exercise the production filter without a browser or Tauri filesystem access.
const source = await readFile(new URL("../src/lib/gallery.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { filterSketches } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const items = [
  { path: "一班/第一次/ABC", notes: "Blue particles 蓝色粒子", rating: 5, favorite: false },
  { path: "二班/DEF", notes: "蓝色图像", rating: 2, favorite: true },
  { path: "一班/第一次/GHI", notes: "声音", rating: 0, favorite: true },
  { path: "一班/第一次/子目录/JKL", notes: "Blue particles", rating: 4, favorite: false },
];
const defaults = { query: "", favoritesOnly: false, rating: "all", scope: "all", currentPath: "一班/第一次" };
const paths = (options) => filterSketches(items, { ...defaults, ...options }).map((item) => item.path);

test("search matches path and notes, ignores case, and combines whitespace-separated words", () => {
  assert.deepEqual(paths({ query: "  一班   BLUE " }), [items[0].path, items[3].path]);
  assert.deepEqual(paths({ query: "声音" }), [items[2].path]);
  assert.deepEqual(paths({ query: "DEF" }), [items[1].path]);
  assert.deepEqual(paths({ query: "不存在" }), []);
});
test("favorite and rating filters are optional, independent, and composable", () => {
  assert.equal(paths({}).length, 4);
  assert.deepEqual(paths({ favoritesOnly: true }), [items[1].path, items[2].path]);
  assert.deepEqual(paths({ rating: "5" }), [items[0].path]);
  assert.deepEqual(paths({ rating: "unrated", favoritesOnly: true }), [items[2].path]);
  assert.deepEqual(paths({ rating: "5", favoritesOnly: true }), []);
  assert.deepEqual(paths({ query: "蓝色", favoritesOnly: true, rating: "2" }), [items[1].path]);
});
test("current-folder scope excludes nested and other-folder projects; global includes all", () => {
  assert.deepEqual(paths({ scope: "folder" }), [items[0].path, items[2].path]);
  assert.deepEqual(paths({ scope: "folder", query: "Blue" }), [items[0].path]);
  assert.deepEqual(paths({ scope: "folder", currentPath: "" }), []);
});
