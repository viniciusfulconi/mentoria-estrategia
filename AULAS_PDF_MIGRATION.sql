-- Migration: suporte a PDF e imagem de capa nas aulas
-- Rodar no Supabase SQL Editor

-- 1. Adiciona coluna pdf_url
alter table aulas add column if not exists pdf_url text;

-- 2. Torna youtube_url e youtube_id opcionais (para aulas só-PDF)
alter table aulas alter column youtube_url drop not null;
alter table aulas alter column youtube_id drop not null;

-- 3. Adiciona coluna imagem_url (capa customizada do card)
alter table aulas add column if not exists imagem_url text;
