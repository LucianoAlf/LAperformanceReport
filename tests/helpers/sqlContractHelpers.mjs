import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveFromTest(testUrl, relativePath) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(testUrl)), '..');
  return path.join(repoRoot, relativePath);
}

export function readSqlContract(testUrl, relativePath) {
  const filePath = resolveFromTest(testUrl, relativePath);
  const exists = existsSync(filePath);
  const source = exists ? readFileSync(filePath, 'utf8') : '';

  return {
    exists,
    filePath,
    source,
    executable: stripSqlComments(source),
  };
}

export function stripSqlComments(source) {
  let output = '';
  let index = 0;
  let state = 'normal';
  let blockDepth = 0;
  let backslashEscapes = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        state = 'normal';
        output += char;
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        output += '  ';
        index += 2;
        continue;
      }
      if (char === '*' && next === '/') {
        blockDepth -= 1;
        output += '  ';
        index += 2;
        if (blockDepth === 0) state = 'normal';
        continue;
      }

      output += char === '\n' || char === '\r' ? char : ' ';
      index += 1;
      continue;
    }

    if (state === 'single-quote') {
      output += char;
      if (backslashEscapes && char === '\\' && next !== undefined) {
        output += next;
        index += 2;
        continue;
      }
      if (char === "'" && next === "'") {
        output += next;
        index += 2;
        continue;
      }
      if (char === "'") {
        state = 'normal';
        backslashEscapes = false;
      }
      index += 1;
      continue;
    }

    if (state === 'double-quote') {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 2;
        continue;
      }
      if (char === '"') state = 'normal';
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      state = 'line-comment';
      output += '  ';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      blockDepth = 1;
      output += '  ';
      index += 2;
      continue;
    }
    if (char === "'") {
      state = 'single-quote';
      const prefix = source.slice(Math.max(0, index - 2), index);
      backslashEscapes = /(?:^|[^a-z0-9_$])e$/i.test(prefix) || /u&$/i.test(prefix);
      output += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      state = 'double-quote';
      output += char;
      index += 1;
      continue;
    }
    if (char === '$') {
      const tag = source.slice(index).match(/^\$[a-z_][a-z0-9_]*\$|^\$\$/i)?.[0];
      if (tag) {
        const closing = source.indexOf(tag, index + tag.length);
        if (closing === -1) {
          output += char;
          index += 1;
          continue;
        }

        const executablePrefix = output.slice(-160);
        const isFunctionBody =
          /\bas\s*$/i.test(executablePrefix) ||
          /\bdo(?:\s+language\s+(?:"[^"]+"|[a-z_][a-z0-9_]*))?\s*$/i.test(
            executablePrefix,
          );
        const content = source.slice(index + tag.length, closing);
        output += tag;
        output += isFunctionBody ? stripSqlComments(content) : content;
        output += tag;
        index = closing + tag.length;
        continue;
      }
    }

    output += char;
    index += 1;
  }

  return output;
}

export function maskSqlStringLiterals(source) {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === "'") {
      const prefix = source.slice(Math.max(0, index - 2), index);
      const backslashEscapes =
        /(?:^|[^a-z0-9_$])e$/i.test(prefix) || /u&$/i.test(prefix);
      output += ' ';
      index += 1;

      while (index < source.length) {
        const current = source[index];
        const next = source[index + 1];
        output += current === '\n' || current === '\r' ? current : ' ';

        if (backslashEscapes && current === '\\' && next !== undefined) {
          output += next === '\n' || next === '\r' ? next : ' ';
          index += 2;
          continue;
        }
        if (current === "'" && next === "'") {
          output += ' ';
          index += 2;
          continue;
        }

        index += 1;
        if (current === "'") break;
      }
      continue;
    }

    if (char === '$') {
      const tag = source.slice(index).match(/^\$[a-z_][a-z0-9_]*\$|^\$\$/i)?.[0];
      if (tag) {
        const closing = source.indexOf(tag, index + tag.length);
        if (closing !== -1) {
          const literal = source.slice(index, closing + tag.length);
          output += literal.replace(/[^\r\n]/g, ' ');
          index = closing + tag.length;
          continue;
        }
      }
    }

    output += char;
    index += 1;
  }

  return output;
}
