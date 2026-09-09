-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha a leitura de tarefas_alunos e atividades por aluno.
--
-- A policy original era `using (true)` para todo autenticado — confiava no
-- filtro do cliente. Um aluno logado conseguia ler as linhas dos outros
-- (verificado ao vivo em 09/09/2026 com token de aluno: vieram tarefas
-- alheias). A UI já foi blindada, mas RLS é a autoridade: aluno só lê o que
-- é dele; staff continua lendo tudo.
-- ═══════════════════════════════════════════════════════════════════════════

-- derruba TODOS os nomes já usados (policies se somam por OR: uma permissiva
-- esquecida anula a restritiva — e o RLS de produção já divergiu do repo antes)
drop policy if exists tarefas_alunos_read  on tarefas_alunos;
drop policy if exists tarefas_alunos_staff on tarefas_alunos;
drop policy if exists tarefas_alunos_self  on tarefas_alunos;
drop policy if exists "autenticado"        on tarefas_alunos;
create policy tarefas_alunos_read on tarefas_alunos for select to authenticated
  using (
    auth_papel() = any (array['coordenador', 'direcao', 'mentor', 'professor'])
    or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  );

-- recria as de escrita que os drops acima removeram (mesmo conteúdo da 022)
create policy tarefas_alunos_staff on tarefas_alunos for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));
create policy tarefas_alunos_self on tarefas_alunos for update to authenticated
  using      (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  with check (auth_papel() = 'aluno' and aluno_id = auth_aluno_id());

-- confere no fim: select polname, tablename from pg_policies
--   where tablename in ('tarefas_alunos','atividades');

-- atividades: aluno lê a agenda geral (aluno_id null) + as próprias linhas
drop policy if exists atividades_read on atividades;
drop policy if exists "autenticado"    on atividades;
create policy atividades_read on atividades for select to authenticated
  using (
    auth_papel() = any (array['coordenador', 'direcao', 'mentor', 'professor'])
    or (auth_papel() = 'aluno' and (aluno_id is null or aluno_id = auth_aluno_id()))
  );

-- Se produção ainda tinha só a policy "autenticado" (for all), o drop acima
-- teria matado a escrita — recria a de escrita da RLS_HARDENING_PART2:
drop policy if exists atividades_write on atividades;
create policy atividades_write on atividades for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));
