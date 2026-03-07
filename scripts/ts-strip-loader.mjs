import ts from "../statrumble/node_modules/typescript/lib/typescript.js";

const TS_SPECIFIER_SUFFIXES = [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx", "/index.mts"];

function isPathLikeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

function hasKnownExtension(specifier) {
  return /\.[a-z0-9]+$/i.test(specifier);
}

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      !isPathLikeSpecifier(specifier) ||
      hasKnownExtension(specifier) ||
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ERR_MODULE_NOT_FOUND"
    ) {
      throw error;
    }

    for (const suffix of TS_SPECIFIER_SUFFIXES) {
      try {
        return await defaultResolve(`${specifier}${suffix}`, context, defaultResolve);
      } catch (candidateError) {
        if (!(candidateError instanceof Error) || !("code" in candidateError) || candidateError.code !== "ERR_MODULE_NOT_FOUND") {
          throw candidateError;
        }
      }
    }

    throw error;
  }
}

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
