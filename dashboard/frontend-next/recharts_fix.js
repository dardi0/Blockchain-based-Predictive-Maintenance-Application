const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(srcDir);

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    // Regex to match "import { ... } from 'recharts';" multiline
    const importRegex = /import\s+\{([\s\S]*?)\}\s+from\s+['"]{1}recharts['"]{1}\s*;/;
    const match = content.match(importRegex);
    if (match) {
        console.log(`Fixing ${file}`);
        const exportsList = match[1];
        const newImport = `import * as RechartsModule from 'recharts';\nconst {${exportsList}} = RechartsModule;`;
        content = content.replace(importRegex, newImport);
        fs.writeFileSync(file, content, 'utf8');
    }
}
console.log('Done replacing Recharts static imports');
