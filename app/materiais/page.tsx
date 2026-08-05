'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { useAuth } from '@/contexts/AuthContext'
import { CORES_MATERIA } from '@/lib/agenda'
import { FolderOpen, ExternalLink, FileText } from 'lucide-react'

// Listas de revisão da reta final — hospedadas no Drive.
// A tarefa de cada aluno aponta a lista específica; aqui fica o conjunto completo.
const F = (id: string) => `https://drive.google.com/file/d/${id}/view`
const PASTA = (id: string) => `https://drive.google.com/drive/folders/${id}`

type Lista = { titulo: string; url: string }
type Materia = { materia: string; pasta: string; listas: Lista[] }

const MATERIAS: Materia[] = [
  {
    materia: 'Física',
    pasta: PASTA('1vyZmKfp1uHpvXpjHSu6LrYQ5dy8Zz5cR'),
    listas: [
      { titulo: 'Cinemática', url: F('1XAaECwOQyqUDviGAPMUbyVf9JlE_MrSa') },
      { titulo: 'Dinâmica', url: F('1gzXOs-viHJ5BBUqpZ_Yp79SfrkBP0gqo') },
      { titulo: 'Estática', url: F('1I_pDmfLDe7v0gKxvH8TTss75006vTTjl') },
      { titulo: 'Trabalho e Energia', url: F('1QffsqgFQQJMY3lnT3B7EH3voRihx-KY3') },
      { titulo: 'Quantidade de Movimento', url: F('1vLAHxDg7gFFAdrPhNvi-2rPEBBQBR2xo') },
      { titulo: 'Gravitação', url: F('1naeFuhWjGN9gSnZxvbLZSKF57wbtt9Az') },
      { titulo: 'Hidrostática e Hidrodinâmica', url: F('1n93KUeWqTP1Myc8WJkNeX_BAxahHGW_r') },
      { titulo: 'Ondulatória', url: F('1HzLPWB4citksECp0Rs0UHpzS6Tn-Zm7C') },
      { titulo: 'Óptica Geométrica', url: F('1sOy4yXNadd-dpweRk2kS8HXFujPrSIYN') },
      { titulo: 'Termologia', url: F('1-qUrGdT4Sl4mnNmn8kMesIk3dp4CRyW-') },
      { titulo: 'Termodinâmica', url: F('1X4bTEchxOtKxFrzIXuF2bF4m2IWPQkNJ') },
      { titulo: 'Eletrostática', url: F('1XViSE3x7t4CRF1zHEw3VUgtAb7mMRWzP') },
      { titulo: 'Eletrodinâmica', url: F('1LPAc96nq4PDtsp8bBp7WBxODSTgvFJyV') },
      { titulo: 'Capacitores', url: F('1ErLP1XBs1jUNBFh-VcX9S2j1KpI8QaDC') },
      { titulo: 'Eletromagnetismo', url: F('1NvnTP9GojRmW39w6X9UJFC3sMUh1HXrb') },
      { titulo: 'Física Moderna', url: F('19y88pI9FCXZal4UM0prrGB6wnc8AuchZ') },
    ],
  },
  {
    materia: 'Matemática',
    pasta: PASTA('1JT8uqOt5W5mMKXZBJilovMNY9M2UEvoV'),
    listas: [
      { titulo: 'Teoria elementar dos conjuntos', url: F('1RRMOhdA9RUjQm-aL0MnG40VCMloWUhHG') },
      { titulo: 'Sequências e progressões', url: F('1fCgQL_SZUiqwG6VV4U9o3Xh_YwZqK3-k') },
      { titulo: 'Funções', url: F('15cfmGDyI1H6voYawPDg5CyG0B_KWNFwS') },
      { titulo: 'Trigonometria', url: F('107YEiaXemWEWSRYuzia6IyMY9ml3Sax1') },
      { titulo: 'Números complexos', url: F('1A2X0Ip3CM0S57pksZ0FF6j3DYhCFku11') },
      { titulo: 'Polinômios e equações algébricas', url: F('1BHGUT9cbRq3iEXV0tqIyKvFbll1Mrr31') },
      { titulo: 'Análise combinatória', url: F('1ETmXrtGh6W8y8KbHOfGivzRrPjlHs-bH') },
      { titulo: 'Probabilidade', url: F('19urGyLln0oW7Eg-et9mIZyqAHJTh_Bhz') },
      { titulo: 'Matrizes', url: F('1fJN3GY00aQA_CeciRdF0KwgMICtBTHmy') },
      { titulo: 'Determinantes', url: F('11AKNFhG5-w4tQBnEvOQYLnBxiQ0DnM4N') },
      { titulo: 'Sistemas lineares', url: F('1YMRgzCBSO2XJAGpdWU-OkVs7-Sre_-rx') },
      { titulo: 'Geometria plana', url: F('1Sotnxv9ijD7FC2GDdiyQQws22E_h3lfE') },
      { titulo: 'Geometria analítica plana', url: F('1vvXqW-xQmmuiFMz0PZc3fqcxos9l1dCa') },
      { titulo: 'Geometria espacial', url: F('1gtS6bd87ksPSztfGpwVZIl5-49dEA-5v') },
    ],
  },
  {
    materia: 'Química',
    pasta: PASTA('1RbjBcPRPj8_yTHIFRR77VbOz7kJPrL6G'),
    listas: [
      { titulo: 'Estrutura atômica', url: F('1Rd7Hp0HEofaupLn0irt8cpDWy4LswVpG') },
      { titulo: 'Tabela Periódica', url: F('1INXdFWDRM6TiNHuSWs5IMpQ6ZrkCEbla') },
      { titulo: 'Geometria Molecular', url: F('1PBgHndUImwvJ30IBnv5-bpC5urt5gkWM') },
      { titulo: 'Estequiometria', url: F('1CDh07_Vi4C7oYfVM68m-hmuvrVd97Av4') },
      { titulo: 'Soluções', url: F('1bGjUo4te71W6oOqnRTITwFz83MtR_uyJ') },
      { titulo: 'Propriedades Coligativas', url: F('1mfidiMMIXdX5SEtvmEupw86HBJKc85aN') },
      { titulo: 'Cinética Química', url: F('1fFibVvfu2HLaPDFIp1cv2c_o_GMYUU-t') },
      { titulo: 'Equilíbrio Químico', url: F('1jZpS58Me_jrz4-xuZOwxCREiCiiLCsup') },
      { titulo: 'Equilíbrio Iônico', url: F('1qHd5L1B1qPDFzXTNSVhQQ5tRZq0OSfbD') },
      { titulo: 'Termoquímica e Termodinâmica', url: F('1QDsLPhjSTP7jgtFz2vIYtouQE86Kkm4H') },
      { titulo: 'Eletroquímica', url: F('1FpjsOIjPydC0NjH7vVUjxp0N_GNMUm1W') },
      { titulo: 'Radioatividade', url: F('190i3DFoOdIv1O9vcc39IDVA9B4-jdRdx') },
      { titulo: 'Química Inorgânica (geral)', url: F('12DVSJbJ46RKsSqVMwtYxMQAA2rGHEEzZ') },
      { titulo: 'Química Orgânica (geral)', url: F('1IiQuRRmuhqOC35mXuRj1TTKE1tjaLGvl') },
    ],
  },
]

export default function Materiais() {
  const { verticalAtiva } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (verticalAtiva === 'Medicina') router.replace('/med/alunos')
  }, [verticalAtiva])

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Materiais</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 14, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
          Listas de revisão da reta final. Sua <b>tarefa</b> já aponta a lista específica de cada tópico —
          aqui você acessa o <b>conjunto completo</b>, se quiser complementar. Faça um pouco por dia, no seu ritmo.
        </div>

        {MATERIAS.map(m => {
          const cor = CORES_MATERIA[m.materia] || '#f97316'
          return (
            <div key={m.materia} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{m.materia}</span>
                  <span style={{ fontSize: 12, color: '#999' }}>{m.listas.length} listas</span>
                </div>
                <a href={m.pasta} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                  background: cor, color: 'white', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}>
                  <FolderOpen size={14} strokeWidth={2} /> Abrir todas
                </a>
              </div>
              <div>
                {m.listas.map((l, i) => (
                  <a key={l.titulo} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', textDecoration: 'none',
                    color: '#333', borderTop: i === 0 ? 'none' : '0.5px solid rgba(0,0,0,0.05)',
                  }}>
                    <FileText size={15} color={cor} strokeWidth={1.7} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13.5 }}>{l.titulo}</span>
                    <ExternalLink size={14} color="#bbb" strokeWidth={1.7} style={{ flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Nav />
    </div>
  )
}
