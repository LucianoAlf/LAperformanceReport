import codecs

# Fix SKILL.md: replace '- \u2705' with '- \U0001f4cb'
path = 'd:/2026/LA-performance-report/.claude/skills/regras-negocio-la/SKILL.md'
with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

count = text.count('\n- ✅')
text = text.replace('\n- ✅', '\n- 📋')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)

print('Done: replaced', count, 'items')
