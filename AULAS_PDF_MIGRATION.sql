-- Migration: suporte a PDF nas aulas
-- Rodar no Supabase SQL Editor

-- 1. Adiciona coluna pdf_url
alter table aulas add column if not exists pdf_url text;

-- 2. Torna youtube_url e youtube_id opcionais (para aulas só-PDF)
alter table aulas alter column youtube_url drop not null;
alter table aulas alter column youtube_id drop not null;
