const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node extract-inativos.cjs <mcp-output-file>'); process.exit(1); }
const raw = fs.readFileSync(filePath, 'utf8');

const wrapper = JSON.parse(raw);
let text = wrapper[0].text;
text = text.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);

const jsonStart = text.indexOf('[{"json_agg":');
if (jsonStart === -1) { console.error('Could not find json_agg'); process.exit(1); }

let depth = 0, jsonEnd = -1;
for (let i = jsonStart; i < text.length; i++) {
  if (text[i] === '[') depth++;
  else if (text[i] === ']') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
}

const outer = JSON.parse(text.substring(jsonStart, jsonEnd));
const data = outer[0].json_agg;
fs.writeFileSync('scripts/db-inativos-cg-export.json', JSON.stringify(data, null, 2));
console.log('Saved ' + data.length + ' records to scripts/db-inativos-cg-export.json');
