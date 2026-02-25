import ts from "../statrumble/node_modules/typescript/lib/typescript.js";

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const loaded = await defaultLoad(url, { ...context, format: "module" });
    const sourceText = loaded.source.toString();
    const { outputText } = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2017,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: url,
    });

    return {
      format: "module",
      source: outputText,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
