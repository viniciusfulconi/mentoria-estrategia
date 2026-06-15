"""
Popular árvore de Física no Supabase a partir do HTML.
Uso: python3 popular_arvore_fisica.py
"""
import os, json, time
from html.parser import HTMLParser
import urllib.request

SUPA_URL = "https://rbvoraafoysnpqxwranx.supabase.co"
SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidm9yYWFmb3lzbnBxeHdyYW54Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU0NDIyMywiZXhwIjoyMDk1MTIwMjIzfQ.t0an8nfzdRkANAPaJx94rmoLnQjOJy0FfcQO6pKPEOw"
HTML_FILE = os.path.expanduser("~/Desktop/Arvore_de_Fisica.html")

def rest(method, path, body=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {SUPA_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# ─── Parse do HTML ──────────────────────────────────────────────────────────

class TreeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.structure = []
        self.current_text = ''
        self.in_summary = False
        self.in_subtopic = False
        self.in_li = False
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'details':
            self.depth += 1
        elif tag == 'summary':
            self.in_summary = True; self.current_text = ''
        elif tag == 'div' and attrs_dict.get('class') == 'sub-topic':
            self.in_subtopic = True; self.current_text = ''
        elif tag == 'li':
            self.in_li = True; self.current_text = ''

    def handle_endtag(self, tag):
        if tag == 'details':
            self.depth -= 1
        elif tag == 'summary':
            self.in_summary = False
            if self.current_text.strip():
                self.structure.append(('M', self.current_text.strip()))
        elif tag == 'div':
            if self.in_subtopic and self.current_text.strip():
                self.structure.append(('T', self.current_text.strip()))
            self.in_subtopic = False
        elif tag == 'li':
            self.in_li = False
            if self.current_text.strip():
                self.structure.append(('S', self.current_text.strip()))

    def handle_data(self, data):
        if self.in_summary or self.in_subtopic or self.in_li:
            self.current_text += data

with open(HTML_FILE, encoding='utf-8') as f:
    p = TreeParser()
    p.feed(f.read())

# ─── Organiza a estrutura ────────────────────────────────────────────────────

tree = []  # list of (materia, topico, subtopico)
cur_m = cur_t = None
for tipo, nome in p.structure:
    if tipo == 'M':
        cur_m = nome; cur_t = None
    elif tipo == 'T':
        cur_t = nome
    elif tipo == 'S':
        if cur_m and cur_t:
            tree.append((cur_m, cur_t, nome))
        elif cur_m:
            # subtópico direto da matéria (sem tópico intermediário, ex: Introdução à física)
            tree.append((cur_m, cur_m, nome))

materias_unicas  = list(dict.fromkeys(m for m, _, _ in tree))
topicos_por_mat  = {}
subtops_por_top  = {}
for m, t, s in tree:
    topicos_por_mat.setdefault(m, [])
    if t not in topicos_por_mat[m]:
        topicos_por_mat[m].append(t)
    subtops_por_top.setdefault((m, t), [])
    if s not in subtops_por_top[(m, t)]:
        subtops_por_top[(m, t)].append(s)

print(f"Matérias: {len(materias_unicas)} | Tópicos: {sum(len(v) for v in topicos_por_mat.values())} | Subtópicos: {len(tree)}")

# ─── Inserção no Supabase ────────────────────────────────────────────────────

materia_ids = {}  # nome → id
topico_ids  = {}  # (materia_nome, topico_nome) → id

print("\n→ Inserindo matérias...")
for ordem, nome in enumerate(materias_unicas):
    rows = rest("POST", "arvore_materias", {"nome": nome, "vertical": "ITA", "ordem": ordem})
    materia_ids[nome] = rows[0]["id"]
    print(f"  ✓ {nome}")

print("\n→ Inserindo tópicos...")
for mat_nome, tops in topicos_por_mat.items():
    for ordem, top_nome in enumerate(tops):
        rows = rest("POST", "arvore_topicos", {
            "materia_id": materia_ids[mat_nome],
            "nome": top_nome,
            "ordem": ordem,
        })
        topico_ids[(mat_nome, top_nome)] = rows[0]["id"]
        print(f"  ✓ {mat_nome} → {top_nome}")

print("\n→ Inserindo subtópicos...")
total = 0
for (mat_nome, top_nome), subtops in subtops_por_top.items():
    for ordem, sub_nome in enumerate(subtops):
        rest("POST", "arvore_subtopicos", {
            "topico_id": topico_ids[(mat_nome, top_nome)],
            "nome": sub_nome,
            "ordem": ordem,
        })
        total += 1

print(f"  ✓ {total} subtópicos inseridos")
print("\n✅ Árvore de Física populada com sucesso!")
