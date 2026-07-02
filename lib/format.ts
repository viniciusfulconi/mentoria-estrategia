// Helpers de normalização de texto — fonte única para evitar reimplementações
// divergentes espalhadas pelas páginas.

// Remove acentos via decomposição NFD (ex.: 'Física' → 'Fisica', 'í' = 'i' + acento).
export function stripAcentos(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Nome seguro para key do Supabase Storage — sem acentos, ª/º, ç, espaços ou
// caracteres especiais. Mantém apenas [a-zA-Z0-9._-].
export function storageSafeName(name: string): string {
  return stripAcentos(name)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
