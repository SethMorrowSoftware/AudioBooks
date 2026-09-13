// Syntax-check every JavaScript module in the repository (no extra dependencies).
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['.', 'test', 'scripts'];
const files = [];
for (const root of roots) {
    for (const name of readdirSync(root)) {
        const path = join(root, name);
        if (statSync(path).isFile() && ['.js', '.mjs'].includes(extname(name))) files.push(path);
    }
}

let failed = false;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        failed = true;
        console.error(result.stderr || `${file}: syntax error`);
    }
}
console.log(failed ? 'lint: FAILED' : `lint: ${files.length} files OK`);
process.exit(failed ? 1 : 0);
