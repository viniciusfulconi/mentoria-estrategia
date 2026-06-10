import { NextRequest, NextResponse } from 'next/server'

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

  // Cria nova sala com gravação em nuvem habilitada
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
  if (!post.ok) throw new Error(data.info || 'Erro ao criar sala')
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
  if (!resp.ok) throw new Error(data.info || 'Erro ao criar token')
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
// Body: { aluno_id, user_name, papel, notificar? }
// Retorna: { room_url, token }
export async function POST(req: NextRequest) {
  try {
    const { aluno_id, user_name, papel, notificar } = await req.json()
    if (!aluno_id || !user_name) {
      return NextResponse.json({ error: 'aluno_id e user_name são obrigatórios' }, { status: 400 })
    }

    const roomName = `mentoria-${aluno_id}`
    const isOwner = papel === 'mentor' || papel === 'coordenador' || papel === 'direcao'

    const [roomUrl, token] = await Promise.all([
      getOrCreateRoom(roomName),
      createToken(roomName, user_name, isOwner),
    ])

    // Notifica o aluno quando mentor/coord inicia
    if (notificar && isOwner) {
      await notificarAluno(aluno_id, user_name, roomName)
    }

    return NextResponse.json({ room_url: roomUrl, token, room_name: roomName })
  } catch (e: any) {
    console.error('videochamada error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
