const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SKIP = new Set(['node_modules', '.next', 'dist', '.git', 'coverage']);
const roots = [path.resolve('backend'), path.resolve('frontend'), path.resolve('shared')];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) verify(file);
  }
}

function verify(file) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    const result = ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) failures.push([file, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))]);
  } catch (error) {
    failures.push([file, [error.message]]);
  }
}

for (const root of roots) if (fs.existsSync(root)) walk(root);
if (failures.length) {
  for (const [file, errors] of failures) console.error(`\n${file}\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('TypeScript/TSX syntax verification passed.');
