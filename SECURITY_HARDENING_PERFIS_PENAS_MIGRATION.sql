-- Hardening de segurança: (1) impede auto-escalonamento de papel/status em `perfis`
-- e (2) torna o crédito de penas atômico (corrige saldo sobrescrito).
-- Revisão de 2026-07. Rodar via: npx supabase db query --linked -f <este arquivo>

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Proteção de `perfis`: papel/status só mudam por coordenador.
--
-- Contexto: a policy `perfis_write` permite o usuário editar a própria linha
-- (id = auth.uid()). Sem esta trava, um aluno podia dar PATCH em perfis setando
-- papel='coordenador'/status='aprovado' e escalar privilégio. Cobrimos INSERT
-- (auto-cadastro) e UPDATE.
--   • auth_papel() lê o papel ATUAL (OLD) do autor — no INSERT do cadastro a linha
--     ainda não existe, então retorna NULL → tratado como não-coordenador.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.perfis_protege_papel_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Coordenador pode tudo.
  IF auth_papel() = 'coordenador' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Auto-cadastro: entra sempre como pendente e nunca com papel privilegiado.
    IF NEW.papel IN ('coordenador', 'direcao') THEN
      RAISE EXCEPTION 'Papel não permitido no cadastro';
    END IF;
    NEW.status := 'pendente';
    RETURN NEW;
  END IF;

  -- UPDATE por não-coordenador: papel e status são imutáveis.
  IF NEW.papel IS DISTINCT FROM OLD.papel OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Alteração de papel/status não permitida';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfis_protege_papel_status ON public.perfis;
CREATE TRIGGER perfis_protege_papel_status
  BEFORE INSERT OR UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.perfis_protege_papel_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Crédito de penas atômico.
--
-- Contexto: /api/penas/creditar fazia POST e, se já existia, PATCH { saldo: valor }
-- — SOBRESCREVIA o saldo em vez de somar. Esta RPC incrementa atomicamente via
-- ON CONFLICT e se auto-protege (só coordenador/direcao), já que é SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.creditar_saldo(p_aluno_id uuid, p_valor int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_papel() NOT IN ('coordenador', 'direcao') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  INSERT INTO public.moedas_saldo (aluno_id, saldo, updated_at)
  VALUES (p_aluno_id, p_valor, now())
  ON CONFLICT (aluno_id) DO UPDATE
    SET saldo = public.moedas_saldo.saldo + EXCLUDED.saldo,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.creditar_saldo(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.creditar_saldo(uuid, int) TO authenticated;

COMMIT;
