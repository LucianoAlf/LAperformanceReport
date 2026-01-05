import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import JarvisOrb from './JarvisOrb'
import { Mic, MicOff, Volume2, VolumeX, X, Power, PowerOff } from 'lucide-react'

type JarvisState = 'sleeping' | 'idle' | 'listening' | 'thinking' | 'speaking'

const WAKE_WORDS = ['jarvis', 'jarves', 'jarvi', 'jarbas']

export function Jarvis() {
  const [isOpen, setIsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true)
  const [state, setState] = useState<JarvisState>('sleeping')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(true)
  const [debugLog, setDebugLog] = useState<string[]>([])
  
  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isListeningRef = useRef(false)

  const log = (msg: string) => {
    console.log('[JARVIS]', msg)
    setDebugLog(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      setError('Navegador não suporta reconhecimento de voz')
      log('SpeechRecognition não suportado')
      return
    }
    log('SpeechRecognition suportado')
    
    audioRef.current = new Audio()
    audioRef.current.onended = () => {
      log('Áudio terminou')
      setState('idle')
      setTimeout(() => startListeningForWakeWord(), 1000)
    }
    
    audioRef.current.onpause = () => {
      if (state === 'speaking') {
        log('Áudio pausado')
        setState('idle')
        setTimeout(() => startListeningForWakeWord(), 500)
      }
    }
  }, [])

  const startListeningForWakeWord = useCallback(() => {
    if (!isEnabled || !isSupported) {
      log('Wake word desabilitado ou não suportado')
      return
    }
    
    if (isListeningRef.current) {
      log('Já está ouvindo, ignorando')
      return
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
      }

      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'pt-BR'

      recognitionRef.current.onstart = () => {
        log('Wake word: Escuta iniciada')
        isListeningRef.current = true
        if (!isOpen) {
          setState('sleeping')
        } else {
          setState('idle')
        }
      }

      recognitionRef.current.onresult = (event: any) => {
        const last = event.results.length - 1
        const text = event.results[last][0].transcript.toLowerCase().trim()
        
        log(`Ouvido: "${text}"`)

        const hasWakeWord = WAKE_WORDS.some(word => text.includes(word))
        
        if (hasWakeWord && event.results[last].isFinal) {
          log('Wake word detectado!')
          
          let command = text
          WAKE_WORDS.forEach(word => {
            command = command.replace(word, '').trim()
          })
          command = command.replace(/^[,.\s]+/, '').trim()

          try {
            recognitionRef.current?.stop()
          } catch (e) {}
          isListeningRef.current = false

          if (!isOpen) {
            setIsOpen(true)
          }

          if (command.length > 2) {
            log(`Comando direto: "${command}"`)
            setTranscript(command)
            processMessage(command)
          } else {
            log('Ativando escuta de comando...')
            playBeep()
            startListeningForCommand()
          }
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        log(`Erro: ${event.error}`)
        isListeningRef.current = false
        
        if (event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
          setTimeout(() => startListeningForWakeWord(), 1000)
        }
      }

      recognitionRef.current.onend = () => {
        log('Wake word: Escuta terminou')
        isListeningRef.current = false
        
        if (isEnabled && (state === 'sleeping' || state === 'idle')) {
          setTimeout(() => startListeningForWakeWord(), 500)
        }
      }

      recognitionRef.current.start()
      log('Iniciando wake word listener...')

    } catch (err: any) {
      log(`Erro ao iniciar: ${err.message}`)
      isListeningRef.current = false
    }
  }, [isEnabled, isSupported, isOpen, state])

  const startListeningForCommand = useCallback(() => {
    if (!isSupported) return

    setState('listening')
    setTranscript('')
    setError(null)

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
      }

      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'pt-BR'

      recognitionRef.current.onstart = () => {
        log('Comando: Escuta iniciada')
        isListeningRef.current = true
      }

      recognitionRef.current.onresult = (event: any) => {
        const last = event.results.length - 1
        const text = event.results[last][0].transcript
        setTranscript(text)
        log(`Transcrito: "${text}"`)

        if (event.results[last].isFinal) {
          log(`Comando final: "${text}"`)
          isListeningRef.current = false
          processMessage(text)
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        log(`Erro comando: ${event.error}`)
        isListeningRef.current = false
        setError('Erro ao ouvir. Tente novamente.')
        setState('idle')
        setTimeout(() => startListeningForWakeWord(), 1000)
      }

      recognitionRef.current.onend = () => {
        log('Comando: Escuta terminou')
        isListeningRef.current = false
        
        if (state === 'listening') {
          setState('idle')
          setTimeout(() => startListeningForWakeWord(), 1000)
        }
      }

      recognitionRef.current.start()
      log('Iniciando escuta de comando...')

      setTimeout(() => {
        if (state === 'listening' && isListeningRef.current) {
          log('Timeout de escuta')
          try {
            recognitionRef.current?.stop()
          } catch (e) {}
        }
      }, 10000)

    } catch (err: any) {
      log(`Erro ao iniciar comando: ${err.message}`)
      setState('idle')
      setTimeout(() => startListeningForWakeWord(), 1000)
    }
  }, [isSupported, state])

  const processMessage = async (message: string) => {
    if (!message.trim()) {
      setState('idle')
      startListeningForWakeWord()
      return
    }

    try {
      recognitionRef.current?.stop()
      recognitionRef.current?.abort()
    } catch (e) {}
    isListeningRef.current = false

    setState('thinking')
    setTranscript('')
    log(`Processando: "${message}"`)

    try {
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { message }
      })

      if (error) {
        log(`Erro Supabase: ${error.message}`)
        throw error
      }

      log('Resposta recebida')
      const { reply, audioBase64 } = data
      setResponse(reply)

      if (audioBase64 && audioRef.current && !isMuted) {
        log('Preparando áudio ElevenLabs...')
        
        try {
          recognitionRef.current?.stop()
          recognitionRef.current?.abort()
        } catch (e) {}
        isListeningRef.current = false
        
        setState('speaking')
        
        const byteCharacters = atob(audioBase64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'audio/mpeg' })
        const audioUrl = URL.createObjectURL(blob)
        
        audioRef.current.onended = () => {
          log('Áudio terminou, aguardando para reiniciar...')
          setState('idle')
          setTimeout(() => {
            log('Reiniciando wake word listener')
            startListeningForWakeWord()
          }, 1500)
        }
        
        audioRef.current.onerror = () => {
          log('Erro no áudio')
          setState('idle')
          setTimeout(() => startListeningForWakeWord(), 1000)
        }
        
        audioRef.current.src = audioUrl
        
        log('Tocando áudio...')
        audioRef.current.play().catch(err => {
          log(`Erro ao tocar: ${err.message}`)
          setState('idle')
          setTimeout(() => startListeningForWakeWord(), 1000)
        })
        
      } else if (!isMuted && 'speechSynthesis' in window) {
        log('Usando fallback Web Speech')
        
        try {
          recognitionRef.current?.stop()
        } catch (e) {}
        isListeningRef.current = false
        
        setState('speaking')
        const utterance = new SpeechSynthesisUtterance(reply)
        utterance.lang = 'pt-BR'
        utterance.onend = () => {
          log('Fala terminou')
          setState('idle')
          setTimeout(() => startListeningForWakeWord(), 1500)
        }
        speechSynthesis.speak(utterance)
        
      } else {
        log('Áudio mutado ou não disponível')
        setState('idle')
        setTimeout(() => startListeningForWakeWord(), 500)
      }

    } catch (err: any) {
      log(`Erro: ${err.message}`)
      setError('Erro ao processar. Tente novamente.')
      setState('idle')
      startListeningForWakeWord()
    }
  }

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 800
      osc.type = 'sine'
      gain.gain.value = 0.1
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc.stop(ctx.currentTime + 0.15)
    } catch (e) {}
  }

  useEffect(() => {
    if (isEnabled && isSupported) {
      log('Iniciando wake word listener...')
      startListeningForWakeWord()
    }
    
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch (e) {}
      isListeningRef.current = false
    }
  }, [isEnabled, isSupported])

  const toggleWakeWord = () => {
    if (isEnabled) {
      log('Desabilitando wake word')
      try {
        recognitionRef.current?.stop()
      } catch (e) {}
      isListeningRef.current = false
      setIsEnabled(false)
    } else {
      log('Habilitando wake word')
      setIsEnabled(true)
    }
  }

  const handleMicClick = () => {
    log('Clique no microfone')
    if (state === 'listening') {
      try {
        recognitionRef.current?.stop()
      } catch (e) {}
    } else if (state === 'speaking') {
      audioRef.current?.pause()
      speechSynthesis.cancel()
      setState('idle')
      startListeningForWakeWord()
    } else {
      playBeep()
      startListeningForCommand()
    }
  }

  const handleClose = () => {
    audioRef.current?.pause()
    speechSynthesis.cancel()
    try {
      recognitionRef.current?.stop()
    } catch (e) {}
    setState('sleeping')
    setIsOpen(false)
    if (isEnabled) {
      setTimeout(() => startListeningForWakeWord(), 500)
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 flex flex-col items-center gap-2 z-50">
        {isEnabled && isSupported && (
          <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1">
            <div className={`w-2 h-2 rounded-full ${isListeningRef.current ? 'bg-green-400 animate-pulse' : 'bg-cyan-400'}`} />
            <span className="text-xs text-gray-400">
              {isListeningRef.current ? 'Ouvindo...' : 'Diga "Jarvis"'}
            </span>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <button
            onClick={toggleWakeWord}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
              ${isEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-gray-500'}`}
          >
            {isEnabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setIsOpen(true)}
            className="w-16 h-16 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 
                      shadow-lg shadow-cyan-500/30 flex items-center justify-center
                      hover:scale-110 transition-transform relative"
          >
            <div className="w-10 h-10 rounded-full border-2 border-white/50 flex items-center justify-center">
              <div className={`w-6 h-6 rounded-full bg-white/80 ${isEnabled ? 'animate-pulse' : ''}`} />
            </div>
            {isEnabled && (
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" />
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isListeningRef.current ? 'bg-green-400 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-cyan-400 font-mono text-lg">J.A.R.V.I.S</span>
          <span className="text-gray-500 text-sm">LA Music</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleWakeWord}
            className={`p-2 rounded-lg ${isEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-gray-400'}`}
          >
            {isEnabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-slate-800"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
          </button>
          <button onClick={handleClose} className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <JarvisOrb state={state} />
      </div>

      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
        {transcript && (
          <div className="text-center mb-4">
            <span className="text-gray-500 text-sm">Você:</span>
            <p className="text-white text-lg">"{transcript}"</p>
          </div>
        )}

        {response && state !== 'listening' && (
          <div className="bg-slate-800/50 rounded-xl p-4 max-h-48 overflow-y-auto">
            <p className="text-gray-300">{response}</p>
          </div>
        )}

        {state === 'thinking' && (
          <div className="text-center">
            <span className="text-purple-400 animate-pulse">Processando...</span>
          </div>
        )}

        {error && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}

        <div className="mt-4 text-xs text-gray-600 max-h-20 overflow-y-auto">
          {debugLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button
          onClick={handleMicClick}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all
            ${state === 'speaking' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
              state === 'listening' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 animate-pulse' :
              state === 'thinking' ? 'bg-gradient-to-r from-purple-500 to-pink-600' :
              'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-cyan-500 hover:to-blue-600'}`}
        >
          {state === 'thinking' ? (
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          ) : state === 'speaking' ? (
            <Volume2 className="w-8 h-8 text-white" />
          ) : state === 'listening' ? (
            <Mic className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-gray-300" />
          )}
        </button>
      </div>

      <div className="absolute bottom-2 text-gray-600 text-sm">
        {state === 'idle' && 'Diga "Jarvis" ou clique no microfone'}
        {state === 'listening' && 'Ouvindo... fale agora'}
        {state === 'thinking' && 'Processando...'}
        {state === 'speaking' && 'Clique para parar'}
      </div>
    </div>
  )
}

export default Jarvis
