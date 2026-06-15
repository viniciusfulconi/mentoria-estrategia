"""
Popular árvore completa (Física, Matemática, Química, Português, Literatura) no Supabase.
Uso: python3 popular_arvore_completa.py
"""
import os, json, ssl
from html.parser import HTMLParser
import urllib.request, urllib.error

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

SUPA_URL = "https://rbvoraafoysnpqxwranx.supabase.co"
SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidm9yYWFmb3lzbnBxeHdyYW54Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU0NDIyMywiZXhwIjoyMDk1MTIwMjIzfQ.t0an8nfzdRkANAPaJx94rmoLnQjOJy0FfcQO6pKPEOw"
FOLDER   = os.path.expanduser("~/Desktop/arvore/")

# ─── REST helper ─────────────────────────────────────────────────────────────

def rest(method, path, body=None):
    url  = f"{SUPA_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {SUPA_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })
    try:
        with urllib.request.urlopen(req, context=_ctx) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code}: {e.read().decode()[:200]}")
        return None

# ─── Parser tipo A: div.sub-topic (Física, Matemática) ──────────────────────

class ParserSubTopic(HTMLParser):
    """Estrutura: summary(matéria) > div.sub-topic(tópico) > li(subtópico)"""
    def __init__(self):
        super().__init__()
        self.tree   = []   # [(materia, topico, subtopico)]
        self._mat   = None
        self._top   = None
        self._text  = ''
        self._in    = None   # 'summary' | 'subtopic' | 'li'

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'summary' and self._in is None:
            self._in = 'summary'; self._text = ''
        elif tag == 'div' and attrs_dict.get('class') == 'sub-topic':
            self._in = 'subtopic'; self._text = ''
        elif tag == 'li' and self._in is None:
            self._in = 'li'; self._text = ''

    def handle_endtag(self, tag):
        if tag == 'summary' and self._in == 'summary':
            t = self._text.strip()
            if t: self._mat = t; self._top = None
            self._in = None
        elif tag == 'div' and self._in == 'subtopic':
            t = self._text.strip()
            if t: self._top = t
            self._in = None
        elif tag == 'li' and self._in == 'li':
            t = self._text.strip()
            if t and self._mat:
                top = self._top or self._mat
                self.tree.append((self._mat, top, t))
            self._in = None

    def handle_data(self, data):
        if self._in:
            self._text += data

# ─── Parser tipo B: details aninhados (Literatura, Português, Química) ───────

class ParserNested(HTMLParser):
    """Estrutura: summary(d1=matéria) > summary(d2=tópico) > summary/li(d3+=subtópico)"""
    def __init__(self):
        super().__init__()
        self.tree   = []
        self.stack  = []   # [(depth, texto)] para summaries abertas
        self.depth  = 0
        self._text  = ''
        self._in    = None   # 'summary' | 'li'
        self._li_d  = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'details':
            self.depth += 1
        elif tag == 'summary':
            self._in = 'summary'; self._text = ''; self._li_d = self.depth
        elif tag == 'li':
            self._in = 'li'; self._text = ''; self._li_d = self.depth

    def handle_endtag(self, tag):
        if tag == 'details':
            # Remove summaries desse depth da stack
            self.stack = [(d, t) for d, t in self.stack if d < self.depth]
            self.depth -= 1
        elif tag == 'summary' and self._in == 'summary':
            t = self._text.strip()
            self._in = None
            if not t: return
            # Remove summaries com depth >= atual (fechando contexto)
            self.stack = [(d, s) for d, s in self.stack if d < self._li_d]
            self.stack.append((self._li_d, t))
        elif tag == 'li' and self._in == 'li':
            t = self._text.strip()
            self._in = None
            if not t: return
            self._emit_li(t)

    def _emit_li(self, subtopico):
        mat = top = None
        # Pega os summaries da stack por profundidade
        depths = sorted(set(d for d, _ in self.stack))
        if not depths: return
        # d mais raso = matéria
        mat_d = depths[0]
        mats  = [t for d, t in self.stack if d == mat_d]
        mat   = mats[-1] if mats else None
        if not mat: return
        # d=2 = tópico (se existir)
        if len(depths) >= 2:
            top_d = depths[1]
            tops  = [t for d, t in self.stack if d == top_d]
            top   = tops[-1] if tops else mat
        else:
            top = mat
        self.tree.append((mat, top, subtopico))

    def handle_data(self, data):
        if self._in:
            self._text += data


# ─── Parser tipo C: Português — summary d1 pode ter li direto (sem tópico) ──
# Mesmo que o B, mas summaries d1 sem subtópico ganham o próprio nome como tópico
# (já coberto pelo ParserNested com top = mat quando len(depths) < 2)

# ─── Detecta tipo de HTML ─────────────────────────────────────────────────────

def detect_type(content):
    if 'sub-topic' in content:
        return 'subtopic'
    return 'nested'

# ─── Parse todos os arquivos ──────────────────────────────────────────────────

ALL_FILES = {
    "Arvore_de_Fisica.html":    "ITA",
    "Arvore_de_Literatura.html": "ITA",
    "Arvore_de_Portugues.html": "ITA",
    "Arvore_de_Quimica.html":   "ITA",
}
# Matemática tem nome especial, busca pelo padrão
for f in os.listdir(FOLDER):
    if 'Matem' in f and f.endswith('.html'):
        ALL_FILES[f] = "ITA"

print("=" * 60)
print("PARSING ÁRVORES")
print("=" * 60)

all_tree: list[tuple[str, str, str, str]] = []  # (vertical, materia, topico, subtopico)

for fname, vertical in sorted(ALL_FILES.items()):
    path = os.path.join(FOLDER, fname)
    if not os.path.exists(path):
        print(f"  !! {fname} não encontrado, pulando")
        continue

    with open(path, encoding='utf-8') as f:
        content = f.read()

    tipo = detect_type(content)
    if tipo == 'subtopic':
        p = ParserSubTopic()
    else:
        p = ParserNested()

    p.feed(content)
    tree = p.tree

    # Remove duplicatas preservando ordem
    seen = set()
    unique = []
    for row in tree:
        if row not in seen:
            seen.add(row)
            unique.append(row)
    tree = unique

    ms = len(set(m for m, _, _ in tree))
    ts = len(set((m, t) for m, t, _ in tree))
    print(f"  {fname}: {ms} matérias | {ts} tópicos | {len(tree)} subtópicos [tipo={tipo}]")

    for mat, top, sub in tree:
        all_tree.append((vertical, mat, top, sub))

# ─── Inserção no Supabase ─────────────────────────────────────────────────────

print("\n" + "=" * 60)
print("INSERINDO NO SUPABASE")
print("=" * 60)

materia_ids:  dict[str, str] = {}       # nome → id
topico_ids:   dict[tuple, str] = {}     # (mat_nome, top_nome) → id

# 1. Matérias únicas (preservando ordem de aparição)
materias_ordem: dict[str, tuple[int, str]] = {}  # nome → (ordem, vertical)
ordem_global = 0
for vertical, mat, top, sub in all_tree:
    if mat not in materias_ordem:
        materias_ordem[mat] = (ordem_global, vertical)
        ordem_global += 1

print(f"\n→ Inserindo {len(materias_ordem)} matérias…")
for nome, (ordem, vertical) in sorted(materias_ordem.items(), key=lambda x: x[1][0]):
    row = rest("POST", "arvore_materias", {"nome": nome, "vertical": vertical, "ordem": ordem})
    if row:
        materia_ids[nome] = row[0]["id"]
        print(f"  ✓ [{vertical}] {nome}")
    else:
        print(f"  ✗ ERRO ao inserir matéria: {nome}")

# 2. Tópicos únicos por matéria
topicos_vistos: dict[tuple, int] = {}
ordem_por_mat: dict[str, int] = {}
for vertical, mat, top, sub in all_tree:
    key = (mat, top)
    if key not in topicos_vistos:
        ordem_mat = ordem_por_mat.get(mat, 0)
        topicos_vistos[key] = ordem_mat
        ordem_por_mat[mat] = ordem_mat + 1

print(f"\n→ Inserindo {len(topicos_vistos)} tópicos…")
for (mat, top), ordem in sorted(topicos_vistos.items(), key=lambda x: x[1]):
    if mat not in materia_ids:
        print(f"  ✗ Matéria não encontrada: {mat} (tópico: {top})")
        continue
    row = rest("POST", "arvore_topicos", {
        "materia_id": materia_ids[mat],
        "nome": top,
        "ordem": ordem,
    })
    if row:
        topico_ids[(mat, top)] = row[0]["id"]
    else:
        print(f"  ✗ ERRO: {mat} > {top}")

print(f"  ✓ {len(topico_ids)} tópicos inseridos")

# 3. Subtópicos
subtopicos_vistos: set = set()
subtopico_rows = []
ordem_por_top: dict[tuple, int] = {}
for vertical, mat, top, sub in all_tree:
    key = (mat, top, sub)
    if key not in subtopicos_vistos:
        subtopicos_vistos.add(key)
        top_key = (mat, top)
        ordem_sub = ordem_por_top.get(top_key, 0)
        ordem_por_top[top_key] = ordem_sub + 1
        if top_key in topico_ids:
            subtopico_rows.append({
                "topico_id": topico_ids[top_key],
                "nome": sub,
                "ordem": ordem_sub,
            })

print(f"\n→ Inserindo {len(subtopico_rows)} subtópicos em lotes…")
BATCH = 50
inseridos = 0
for i in range(0, len(subtopico_rows), BATCH):
    batch = subtopico_rows[i:i+BATCH]
    rest("POST", "arvore_subtopicos", batch)
    inseridos += len(batch)
    print(f"  {inseridos}/{len(subtopico_rows)}…", end='\r')

print(f"\n  ✓ {inseridos} subtópicos inseridos")

print("\n✅ Árvore completa populada com sucesso!")
print(f"   {len(materia_ids)} matérias | {len(topico_ids)} tópicos | {inseridos} subtópicos")
