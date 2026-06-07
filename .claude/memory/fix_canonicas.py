import codecs

# Fix canonicas
with codecs.open('d:/2026/LA-performance-report/.claude/memory/regras-negocio-canonicas.md','r','utf-8') as f:
    text = f.read()
old_count = text.count('\n- ✅')
text = text.replace('\n- ✅', '\n- 📋')
with codecs.open('d:/2026/LA-performance-report/.claude/memory/regras-negocio-canonicas.md','w','utf-8') as f:
    f.write(text)
print(f'Canonicas: replaced {old_count} remaining ✅ with 📋')

# Fix SKILL.md
with codecs.open('d:/2026/LA-performance-report/.claude/skills/regras-negocio-la/SKILL.md','r','utf-8') as f:
    text2 = f.read()
old_count2 = text2.count('\n- ✅')
text2 = text2.replace('\n- ✅', '\n- 📋')
with codecs.open('d:/2026/LA-performance-report/.claude/skills/regras-negocio-la/SKILL.md','w','utf-8') as f:
    f.write(text2)
print(f'SKILL: replaced {old_count2} ✅ with 📋')
