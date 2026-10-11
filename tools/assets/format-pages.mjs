import {formatPages} from 'edgepress/tools/assets/format-pages.mjs';
const write = process.argv.includes('--write');
if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('Usage: npm run pages:format -- [--write]');
console.log(`${write ? 'Formatted' : 'Would format'} ${(await formatPages(process.cwd(), {write})).length} Pages documents.`);
