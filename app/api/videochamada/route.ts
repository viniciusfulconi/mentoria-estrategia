import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, AuthUser } from '@/lib/auth-server'

const DAILY_KEY = process.env.DAILY_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ROOM_TTL = 4 * 60 * 60 // 4h

const dailyHeaders = {
  'Authorization': `Bearer ${DAILY_KEY}`,
  'Content-Type': 'application/json',
}
// Service role — usado só no servidor, após verifyAuth confirmar o papel.
const supaHeaders = {
  apikey: SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const ehStaff = (u: AuthUser) => u.papel === 'mentor' || u.papel === 'coordenador' || u.papel === 'direcao'

async function getOrCreateRoom(roomName: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ROOM_TTL
  // Tenta buscar sala existente (o nome é fixo/permanente por aluno)
  const get = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, { headers: dailyHeaders })
  if (get.ok) {
    const data = await get.json()
    // Estende a expiração da sala reutilizada. Sem isso, uma sala criada de manhã
    // (exp = +4h) estaria expirada à tarde e o join falharia mesmo com token válido.
    await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'POST',
      headers: dailyHeaders,
      body: JSON.stringify({ properties: { exp } }),
    }).catch(() => {})
    return data.url
  }

  // Cria nova sala
  const post = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: dailyHeaders,
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: { exp, enable_chat: true, start_video_off: false, start_audio_off: false, enable_knocking: false },
    }),
  })
  const data = await post.json()
  if (!post.ok) {
    console.error('[Daily] Erro ao criar sala:', JSON.stringify(data))
    throw new Error(data.error || data.info || 'Erro ao criar sala')
  }
  return data.url
}

async function createToken(roomName: string, userName: string, isOwner: boolean): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ROOM_TTL
  const resp = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: dailyHeaders,
    body: JSON.stringify({ properties: { room_name: roomName, user_name: userName, is_owner: isOwner, exp } }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    console.error('[Daily] Erro ao criar token:', JSON.stringify(data))
    throw new Error(data.error || data.info || 'Erro ao criar token')
  }
  return data.token
}

// ── Estado da sala em salas_videochamada (antes a tabela era órfã) ──────────────
async function getSalaAtiva(alunoId: string): Promise<{ id: string } | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/salas_videochamada?aluno_id=eq.${alunoId}&status=eq.ativa&select=id&limit=1`,
    { headers: supaHeaders }
  )
  if (!r.ok) return null
  const d = await r.json()
  return Array.isArray(d) && d[0] ? d[0] : null
}

// Registra/atualiza a sala ativa. Retorna { criada } — criada=true só quando NÃO
// havia sala ativa (usado para notificar o aluno só uma vez, sem spam).
async function registrarSalaAtiva(alunoId: string, roomName: string, roomUrl: string, iniciadaPor: string): Promise<{ criada: boolean }> {
  const existente = await getSalaAtiva(alunoId)
  if (existente) {
    await fetch(`${SUPABASE_URL}/rest/v1/salas_videochamada?id=eq.${existente.id}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ room_url: roomUrl, updated_at: new Date().toISOString() }),
    }).catch(() => {})
    return { criada: false }
  }
  await fetch(`${SUPABASE_URL}/rest/v1/salas_videochamada`, {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ aluno_id: alunoId, room_name: roomName, room_url: roomUrl, status: 'ativa', iniciada_por: iniciadaPor }),
  }).catch(() => {})
  return { criada: true }
}

async function encerrarSala(alunoId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/salas_videochamada?aluno_id=eq.${alunoId}&status=eq.ativa`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'encerrada', updated_at: new Date().toISOString() }),
  }).catch(() => {})
}

async function notificarAluno(alunoId: string, nomeIniciador: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/notificacoes`, {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      aluno_id: alunoId,
      tipo: 'chamada',
      titulo: '📹 Videochamada iniciada',
      mensagem: `${nomeIniciador} está esperando por você na videochamada.`,
      lida: false,
    }),
  }).catch(() => {})
}

// POST /api/videochamada — cria/entra na sala. Body: { aluno_id, notificar? }
// Papel e nome vêm do perfil autenticado — nunca do body. Retorna { room_url, token }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await verifyAuth(req, body)
    if ('error' in auth) return auth.error
    const { user } = auth

    const { aluno_id, notificar } = body
    if (!aluno_id) return NextResponse.json({ error: 'aluno_id obrigatório' }, { status: 400 })

    const isStaff = ehStaff(user)
    const isOwnRoom = user.papel === 'aluno' && user.aluno_id === aluno_id
    if (!isStaff && !isOwnRoom) {
      return NextResponse.json({ error: 'Sem permissão para esta sala' }, { status: 403 })
    }

    const roomName = `mentoria-${aluno_id}`
    const userName = user.nome || user.email?.split('@')[0] || 'Convidado'

    const roomUrl = await getOrCreateRoom(roomName)
    const token = await createToken(roomName, userName, isStaff)

    // Só o staff (owner) registra a sala como ativa e dispara a notificação — e só
    // quando a sala é criada (não a cada reentrada), evitando spam de notificação.
    if (isStaff) {
      const { criada } = await registrarSalaAtiva(aluno_id, roomName, roomUrl, userName)
      if (notificar && criada) await notificarAluno(aluno_id, userName)
    }

    return NextResponse.json({ room_url: roomUrl, token, room_name: roomName })
  } catch (e: any) {
    console.error('videochamada error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/videochamada — encerra a sala ativa. Body: { aluno_id }
// Chamado quando o staff (owner) sai da chamada.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await verifyAuth(req, body)
    if ('error' in auth) return auth.error
    const { user } = auth

    const { aluno_id } = body
    if (!aluno_id) return NextResponse.json({ error: 'aluno_id obrigatório' }, { status: 400 })

    const isOwnRoom = user.papel === 'aluno' && user.aluno_id === aluno_id
    if (!ehStaff(user) && !isOwnRoom) {
      return NextResponse.json({ error: 'Sem permissão para esta sala' }, { status: 403 })
    }

    await encerrarSala(aluno_id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('videochamada encerrar error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
