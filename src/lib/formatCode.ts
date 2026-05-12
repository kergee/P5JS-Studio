export async function formatJavaScript(code: string): Promise<string> {
  const [prettier, babelPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);

  return prettier.format(code, {
    parser: "babel",
    plugins: [babelPlugin, estreePlugin],
    printWidth: 90,
    tabWidth: 2,
    semi: true,
    singleQuote: false,
  });
}
