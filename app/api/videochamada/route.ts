import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'

const DAILY_KEY = process.env.DAILY_API_KEY!
const DAILY_DOMAIN = process.env.DAILY_DOMAIN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const dailyHeaders = {
  'Authorization': `Bearer ${DAILY_KEY}`,
  'Content-Type': 'application/json',
}

async function getOrCreateRoom(roomName: string): Promise<string> {
  // Tenta buscar sala existente
  const get = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, { headers: dailyHeaders })
  if (get.ok) {
    const data = await get.json()
    return data.url
  }

  // Cria nova sala
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60 // expira em 4h
  const post = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: dailyHeaders,
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        exp,
        enable_chat: true,
        start_video_off: false,
        start_audio_off: false,
        enable_knocking: false,
      },
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
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const resp = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: dailyHeaders,
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: isOwner,
        exp,
      },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    console.error('[Daily] Erro ao criar token:', JSON.stringify(data))
    throw new Error(data.error || data.info || 'Erro ao criar token')
  }
  return data.token
}

async function notificarAluno(alunoId: string, nomeIniciador: string, roomName: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/notificacoes`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      aluno_id: alunoId,
      tipo: 'chamada',
      titulo: '📹 Videochamada iniciada',
      mensagem: `${nomeIniciador} está esperando por você na videochamada.`,
      lida: false,
    }),
  })
}

// POST /api/videochamada
// Body: { aluno_id, notificar? }
// Header: Authorization: Bearer <jwt>
// Papel e nome vêm do perfil autenticado — nunca do body
// Retorna: { room_url, token }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await verifyAuth(req, body)
    if ('error' in auth) return auth.error
    const { user } = auth

    const { aluno_id, notificar } = body
    if (!aluno_id) {
      return NextResponse.json({ error: 'aluno_id obrigatório' }, { status: 400 })
    }

    const isStaff = user.papel === 'mentor' || user.papel === 'coordenador' || user.papel === 'direcao'
    const isOwnRoom = user.papel === 'aluno' && user.aluno_id === aluno_id
    if (!isStaff && !isOwnRoom) {
      return NextResponse.json({ error: 'Sem permissão para esta sala' }, { status: 403 })
    }

    const roomName = `mentoria-${aluno_id}`
    const isOwner = isStaff

    // Nome do usuário vem do perfil
    const userName = user.nome || user.email?.split('@')[0] || 'Convidado'

    // Sala deve existir antes de criar o token (exigência do Daily.co para salas privadas)
    const roomUrl = await getOrCreateRoom(roomName)
    const token = await createToken(roomName, userName, isOwner)

    // Notifica o aluno quando mentor/coord inicia
    if (notificar && isOwner) {
      await notificarAluno(aluno_id, userName, roomName)
    }

    return NextResponse.json({ room_url: roomUrl, token, room_name: roomName })
  } catch (e: any) {
    console.error('videochamada error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
