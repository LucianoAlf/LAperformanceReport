const fs = require('fs');

const filePath = process.argv[2] || 'C:\\Users\\hugog\\.claude\\projects\\c--Users-hugog-OneDrive-Desktop-Projects-LA-Music-LAperformanceReport\\4b914501-e856-45af-a646-80c31802dd55\\tool-results\\mcp-supabase-execute_sql-1772035481540.txt';
const raw = fs.readFileSync(filePath, 'utf8');

// File is JSON: [{type: "text", text: "...escaped..."}]
const wrapper = JSON.parse(raw);
let text = wrapper[0].text;

// text is a JSON-encoded string with \" and \n escapes
// The text value itself is wrapped in quotes and escaped, unescape it
text = text.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

// Remove surrounding quotes if present
if (text.startsWith('"') && text.endsWith('"')) {
  text = text.slice(1, -1);
}

// Now find [{"json_agg":[...]}]
const jsonStart = text.indexOf('[{"json_agg":');
if (jsonStart === -1) {
  console.error('Could not find json_agg');
  process.exit(1);
}

let depth = 0;
let jsonEnd = -1;
for (let i = jsonStart; i < text.length; i++) {
  if (text[i] === '[') depth++;
  else if (text[i] === ']') {
    depth--;
    if (depth === 0) { jsonEnd = i + 1; break; }
  }
}

const jsonStr = text.substring(jsonStart, jsonEnd);
const outer = JSON.parse(jsonStr);
const data = outer[0].json_agg;
fs.writeFileSync('scripts/db-alunos-cg-export.json', JSON.stringify(data, null, 2));
console.log('Saved ' + data.length + ' records to scripts/db-alunos-cg-export.json');
