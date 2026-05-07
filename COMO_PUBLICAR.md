# Como publicar a plataforma — passo a passo

## Passo 1 — Criar as tabelas no Supabase

1. Acesse https://supabase.com e entre no seu projeto
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New query**
4. Abra o arquivo `SUPABASE_SETUP.sql` nesta pasta (no VS Code)
5. Copie todo o conteúdo e cole no editor do Supabase
6. Clique em **Run** (botão verde)
7. Deve aparecer "Success. No rows returned"

---

## Passo 2 — Subir o código no GitHub

1. Acesse https://github.com e crie um repositório novo chamado `mentoria-estrategia`
   - Deixe como **Private** (privado)
   - Não marque nenhuma opção extra
   - Clique em **Create repository**

2. Abra o **Terminal** no Mac (⌘ + espaço → "Terminal")

3. Navegue até a pasta do projeto (substitua SEU_USUARIO pelo seu nome de usuário no Mac):
   ```
   cd /Users/viniciusfulconi/Downloads/mentoria-estrategia
   ```

4. Execute estes comandos um por um:
   ```
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/viniciusfulconi/mentoria-estrategia.git
   git push -u origin main
   ```
   (substitua SEU_USUARIO_GITHUB pelo seu usuário do GitHub)

---

## Passo 3 — Publicar na Vercel

1. Acesse https://vercel.com e faça login com sua conta GitHub
2. Clique em **Add New → Project**
3. Escolha o repositório `mentoria-estrategia`
4. Clique em **Import**
5. Na seção **Environment Variables**, adicione:
   - Nome: `NEXT_PUBLIC_SUPABASE_URL`
   - Valor: `https://eyasulgkneeozeyqkgyq.supabase.co`
   
   Clique em **Add** e adicione mais uma:
   - Nome: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Valor: `sb_publishable_m3oBBSsOJQMWTj3Ykbqaug_kGQOiqHd`

6. Clique em **Deploy**
7. Aguarde ~2 minutos
8. A Vercel vai te dar um link tipo: `https://mentoria-estrategia.vercel.app`

---

## Pronto! Sua plataforma está no ar.

Para testar localmente antes de publicar, no Terminal:
```
cd /Users/SEU_USUARIO/Downloads/mentoria-estrategia
npm run dev
```
Acesse: http://localhost:3000
