import { transform } from "sucrase";

export type CompileResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Patterns blocked in instance code for security.
 * Instance code should use SDK functions instead of direct browser APIs.
 */
const BLOCKED_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bimport\s*\(/, name: "dynamic import()" },
  { pattern: /\brequire\s*\(/, name: "require()" },
  { pattern: /\beval\s*\(/, name: "eval()" },
  { pattern: /\bnew\s+Function\s*\(/, name: "new Function()" },
  { pattern: /\bglobalThis\b/, name: "globalThis" },
  { pattern: /\bwindow\b/, name: "window" },
  { pattern: /\bdocument\b/, name: "document" },
  { pattern: /(?<!\.)fetch\s*\(/, name: "fetch() — use useCstmQuery/sdk instead" },
  { pattern: /\blocalStorage\b/, name: "localStorage" },
  { pattern: /\bsessionStorage\b/, name: "sessionStorage" },
  { pattern: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
];

/**
 * Compile JSX/TypeScript source to plain JavaScript.
 * Uses sucrase for fast, lightweight transformation.
 */
export function compileJSX(source: string): CompileResult {
  // Security: check for blocked patterns before compilation
  for (const { pattern, name } of BLOCKED_PATTERNS) {
    if (pattern.test(source)) {
      return {
        ok: false,
        error: `Blocked: "${name}" is not allowed in instance code. Use SDK functions instead.`,
      };
    }
  }

  try {
    const result = transform(source, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
      production: true,
    });
    return { ok: true, code: result.code };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Compilation failed",
    };
  }
}
