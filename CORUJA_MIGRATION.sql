-- Função que executa queries SELECT para a Coruja Inteligente
-- Só pode ser chamada com service_role key (SECURITY DEFINER + search_path restrito)
CREATE OR REPLACE FUNCTION coruja_query(sql_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  sql_upper text;
BEGIN
  sql_upper := upper(trim(sql_text));

  -- Só permite SELECT
  IF sql_upper NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Apenas consultas SELECT são permitidas.';
  END IF;

  -- Bloqueia palavras perigosas (word boundaries para não bloquear nomes de tabelas/colunas)
  IF sql_upper ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY|DO)\M' THEN
    RAISE EXCEPTION 'Operação não permitida.';
  END IF;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_text || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Apenas service_role pode chamar esta função
REVOKE ALL ON FUNCTION coruja_query(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION coruja_query(text) FROM anon;
REVOKE ALL ON FUNCTION coruja_query(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION coruja_query(text) TO service_role;
