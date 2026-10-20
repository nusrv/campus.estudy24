// Syntax and local-import verification for environments without installed dependencies.
// This deliberately does not substitute for `npm run typecheck` or `npm run build`.
const fs = require("node:fs");
const path = require("node:path");
const compilerPath = process.argv[2] || "typescript";
const ts = require(compilerPath);
const root = path.resolve(__dirname, "..");
let count = 0;
let failures = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.tsx?$/.test(filename)) {
      const source = fs.readFileSync(filename, "utf8");
      const result = ts.transpileModule(source, { fileName: filename, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, isolatedModules: true }, reportDiagnostics: true });
      for (const diagnostic of result.diagnostics || []) {
        if (diagnostic.category === ts.DiagnosticCategory.Error) {
          console.error(filename + ": " + ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
          failures++;
        }
      }
      const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
      for (const statement of parsed.statements) {
        if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier.text) continue;
        const spec = statement.moduleSpecifier.text;
        if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
        const target = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : path.resolve(path.dirname(filename), spec);
        if (![target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"), path.join(target, "index.tsx")].some(p => fs.existsSync(p))) {
          console.error(`Missing local import: ${filename} -> ${spec}`);
          failures++;
        }
      }
      count++;
    }
  }
}
walk(path.join(root, "src"));
for (const json of ["package.json", "tsconfig.json", "components.json"]) JSON.parse(fs.readFileSync(path.join(root, json), "utf8"));
console.log(`${count} TypeScript/TSX files checked; ${failures} syntax/import errors. JSON configuration parses successfully.`);
process.exitCode = failures ? 1 : 0;
