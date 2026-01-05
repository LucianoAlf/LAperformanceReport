import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import JarvisOrb from './JarvisOrb'
import { Mic, MicOff, Volume2, VolumeX, X, Power, PowerOff } from 'lucide-react'

type JarvisState = 'sleeping' | 'idle' | 'listening' | 'thinking' | 'speaking'

interface Message {
  role: 'user' | 'model'
  parts: { text: string }[]
}

const WAKE_WORDS = ['jarvis', 'jarves', 'jarvi', 'jarbas', 'járvis', 'chavis', 'travis']

export function Jarvis() {
  const [isOpen, setIsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true)
  const [state, setState] = useState<JarvisState>('sleeping')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastWakeTime, setLastWakeTime] = useState<number>(0)
  const [showNotification, setShowNotification] = useState(false)
  const [audioVolume, setAudioVolume] = useState(0)
  
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isRestartingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setError('Seu navegador não suporta reconhecimento de voz')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    wakeRecognitionRef.current = new SpeechRecognition()
    wakeRecognitionRef.current.continuous = true
    wakeRecognitionRef.current.interimResults = true
    wakeRecognitionRef.current.lang = 'pt-BR'

    wakeRecognitionRef.current.onresult = (event) => {
      if (!isEnabled || (state !== 'sleeping' && state !== 'idle')) return

      const current = event.resultIndex
      const transcriptResult = event.results[current][0].transcript.toLowerCase().trim()
      
      const hasWakeWord = WAKE_WORDS.some(word => transcriptResult.includes(word))
      
      if (hasWakeWord) {
        const now = Date.now()
        if (now - lastWakeTime < 3000) return
        setLastWakeTime(now)

        let command = transcriptResult
        WAKE_WORDS.forEach(word => {
          command = command.replace(word, '').trim()
        })
        command = command.replace(/^[,.\s]+/, '').trim()

        if (event.results[current].isFinal) {
          wakeRecognitionRef.current?.stop()
          
          if (!isOpen) {
            setIsOpen(true)
            setShowNotification(true)
            setTimeout(() => setShowNotification(false), 2000)
          }

          if (command.length > 3) {
            setTranscript(command)
            handleSendMessage(command)
          } else {
            activateListening()
          }
        }
      }
    }

    wakeRecognitionRef.current.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      if (isRestartingRef.current) return
      if (event.error === 'network' || event.error === 'not-allowed') {
        console.error('Critical wake word error:', event.error)
        setIsEnabled(false)
      }
    }

    wakeRecognitionRef.current.onend = () => {
      if (!isEnabled || (state !== 'sleeping' && state !== 'idle')) return
      if (isRestartingRef.current) return
      
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        startWakeWordListening()
      }, 1000)
    }

    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = 'pt-BR'

    recognitionRef.current.onresult = (event) => {
      const current = event.resultIndex
      const transcriptResult = event.results[current][0].transcript
      setTranscript(transcriptResult)
      
      if (event.results[current].isFinal) {
        handleSendMessage(transcriptResult)
      }
    }

    recognitionRef.current.onerror = (event) => {
      if (event.error === 'aborted') {
        setState('idle')
        setTimeout(() => startWakeWordListening(), 500)
        return
      }
      setError('Erro no reconhecimento de voz')
      setState('idle')
      setTimeout(() => startWakeWordListening(), 1000)
    }

    recognitionRef.current.onend = () => {
      if (state === 'listening') {
        setState('idle')
        setTimeout(() => startWakeWordListening(), 1000)
      }
    }

    audioRef.current = new Audio()
    audioRef.current.onended = () => {
      setState('idle')
      setAudioVolume(0)
      setTimeout(() => startWakeWordListening(), 500)
    }
    audioRef.current.onerror = () => {
      setState('idle')
      setAudioVolume(0)
      setTimeout(() => startWakeWordListening(), 500)
    }

    if (isEnabled) {
      startWakeWordListening()
    }

    return () => {
      wakeRecognitionRef.current?.stop()
      recognitionRef.current?.stop()
      audioRef.current?.pause()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      isRestartingRef.current = false
    }
  }, [isEnabled])

  useEffect(() => {
    if ((state === 'idle' || state === 'sleeping') && isEnabled) {
      const timer = setTimeout(() => startWakeWordListening(), 1000)
      return () => clearTimeout(timer)
    }
  }, [state, isEnabled])

  const startWakeWordListening = () => {
    if (isRestartingRef.current) return
    
    try {
      if (wakeRecognitionRef.current && isEnabled && (state === 'sleeping' || state === 'idle')) {
        isRestartingRef.current = true
        wakeRecognitionRef.current.start()
        if (!isOpen) {
          setState('sleeping')
        } else {
          setState('idle')
        }
        setTimeout(() => {
          isRestartingRef.current = false
        }, 500)
      }
    } catch (e) {
      isRestartingRef.current = false
    }
  }

  const activateListening = () => {
    setState('listening')
    setTranscript('')
    setError(null)
    
    playActivationSound()
    
    setTimeout(() => {
      try {
        recognitionRef.current?.start()
      } catch (e) {}
    }, 300)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (state === 'listening') {
        recognitionRef.current?.stop()
        setState('idle')
        startWakeWordListening()
      }
    }, 10000)
  }

  const playActivationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.1)
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (e) {}
  }

  const playAudio = useCallback((audioBase64: string) => {
    if (isMuted || !audioRef.current) {
      setState('idle')
      setTimeout(() => startWakeWordListening(), 500)
      return
    }

    setState('speaking')
    
    const byteCharacters = atob(audioBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'audio/mpeg' })
    const audioUrl = URL.createObjectURL(blob)
    
    audioRef.current.src = audioUrl
    
    // Criar AudioContext apenas quando necessário e com user gesture
    const playWithAnalyser = async () => {
      try {
        await audioRef.current!.play()
        
        // Tentar criar AudioContext para análise de volume
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
          }
          
          // Só criar source se ainda não foi criado
          if (!analyserRef.current) {
            const source = audioContextRef.current.createMediaElementSource(audioRef.current!)
            analyserRef.current = audioContextRef.current.createAnalyser()
            analyserRef.current.fftSize = 256
            
            source.connect(analyserRef.current)
            analyserRef.current.connect(audioContextRef.current.destination)
          }
          
          const updateVolume = () => {
            if (analyserRef.current && state === 'speaking') {
              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
              analyserRef.current.getByteFrequencyData(dataArray)
              const average = dataArray.reduce((a, b) => a + b) / dataArray.length
              setAudioVolume(average / 255)
              requestAnimationFrame(updateVolume)
            }
          }
          updateVolume()
        } catch (e) {
          // Fallback sem visualização de volume
          console.log('AudioContext não disponível, continuando sem análise de volume')
        }
      } catch (err) {
        console.error('Erro ao tocar áudio:', err)
        setState('idle')
        setTimeout(() => startWakeWordListening(), 500)
      }
    }
    
    playWithAnalyser()
  }, [isMuted, state])

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return

    recognitionRef.current?.stop()
    wakeRecognitionRef.current?.stop()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    setState('thinking')
    setTranscript('')
    setError(null)

    console.log('📤 Enviando mensagem para JARVIS:', message)

    try {
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { message, history }
      })

      console.log('📥 Resposta recebida:', { data, error })

      if (error) {
        console.error('❌ Erro da Edge Function:', error)
        throw error
      }

      if (!data) {
        throw new Error('Nenhum dado retornado da Edge Function')
      }

      const { reply, audioBase64 } = data
      
      if (!reply) {
        throw new Error('Resposta vazia da Edge Function')
      }

      console.log('✅ Reply:', reply)
      console.log('🎵 Audio Base64:', audioBase64 ? `${audioBase64.length} bytes` : 'null')

      setResponse(reply)
      
      setHistory(prev => [
        ...prev,
        { role: 'user', parts: [{ text: message }] },
        { role: 'model', parts: [{ text: reply }] }
      ])

      if (audioBase64) {
        console.log('🔊 Tocando áudio do ElevenLabs')
        playAudio(audioBase64)
      } else {
        console.log('🔊 Fallback para Web Speech API')
        const utterance = new SpeechSynthesisUtterance(reply)
        utterance.lang = 'pt-BR'
        utterance.onend = () => {
          setState('idle')
          setTimeout(() => startWakeWordListening(), 500)
        }
        speechSynthesis.speak(utterance)
        setState('speaking')
      }

    } catch (err) {
      console.error('❌ Erro ao processar:', err)
      setError(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
      setState('idle')
      setTimeout(() => startWakeWordListening(), 1000)
    }
  }

  const startListening = () => {
    wakeRecognitionRef.current?.stop()
    activateListening()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  const stopSpeaking = () => {
    audioRef.current?.pause()
    speechSynthesis.cancel()
    setAudioVolume(0)
    setState('idle')
    setTimeout(() => startWakeWordListening(), 500)
  }

  const toggleMute = () => {
    if (!isMuted) {
      audioRef.current?.pause()
      speechSynthesis.cancel()
      if (state === 'speaking') setState('idle')
    }
    setIsMuted(!isMuted)
  }

  const toggleWakeWord = () => {
    if (isEnabled) {
      wakeRecognitionRef.current?.stop()
      setIsEnabled(false)
    } else {
      setIsEnabled(true)
      setTimeout(() => startWakeWordListening(), 500)
    }
  }

  const handleClose = () => {
    audioRef.current?.pause()
    speechSynthesis.cancel()
    recognitionRef.current?.stop()
    setAudioVolume(0)
    setState('sleeping')
    setIsOpen(false)
    if (isEnabled) {
      setTimeout(() => startWakeWordListening(), 500)
    }
  }

  const clearHistory = () => {
    setHistory([])
    setResponse('')
    setTranscript('')
  }

  if (!isOpen) {
    return (
      <>
        {showNotification && (
          <div className="fixed top-6 right-6 bg-cyan-500/20 border border-cyan-500/50 rounded-xl px-4 py-3 backdrop-blur-sm z-50 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-cyan-400 font-medium">JARVIS Ativado</span>
            </div>
          </div>
        )}

        <div className="fixed bottom-8 right-8 flex flex-col items-center gap-2 z-50">
          {isEnabled && (
            <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1">
              <div className={`w-2 h-2 rounded-full ${state === 'sleeping' ? 'bg-cyan-400 animate-pulse' : 'bg-green-400'}`} />
              <span className="text-xs text-gray-400">
                {state === 'sleeping' ? 'Diga "Jarvis"' : 'Ativo'}
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

            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-cyan-400/30 blur-2xl animate-pulse" />
              
              <button
                onClick={() => setIsOpen(true)}
                className="relative w-24 h-24 rounded-full 
                          shadow-2xl shadow-cyan-500/60 flex items-center justify-center
                          hover:scale-110 transition-transform group animate-pulse"
              >
                <img 
                  src="/jarvis.png" 
                  alt="JARVIS" 
                  className="w-full h-full rounded-full object-cover"
                />
                
                {isEnabled && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" />
                    <div className="absolute inset-[-4px] rounded-full border border-cyan-400/20 animate-pulse" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isEnabled ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-cyan-400 font-mono text-lg tracking-wider">J.A.R.V.I.S</span>
          <span className="text-gray-500 text-sm">LA Music Assistant</span>
          {isEnabled && (
            <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-1 rounded-full">
              Wake Word Ativo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleWakeWord}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2
              ${isEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-gray-400'}`}
          >
            {isEnabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
          </button>
          
          <button onClick={toggleMute} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            {isMuted ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
          </button>
          
          <button onClick={clearHistory} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 text-sm">
            Limpar
          </button>
          
          <button onClick={handleClose} className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20">
            <X className="w-5 h-5 text-gray-400 hover:text-red-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <JarvisOrb state={state} audioVolume={audioVolume} />
      </div>

      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
        {transcript && (
          <div className="text-center mb-4">
            <span className="text-gray-500 text-sm">Você disse:</span>
            <p className="text-white text-lg">"{transcript}"</p>
          </div>
        )}

        {response && state !== 'listening' && (
          <div className="bg-slate-800/50 rounded-xl p-4 backdrop-blur-sm border border-slate-700/50 max-h-48 overflow-y-auto">
            <p className="text-gray-300 leading-relaxed">{response}</p>
          </div>
        )}

        {state === 'thinking' && (
          <div className="text-center">
            <span className="text-purple-400 animate-pulse">Processando...</span>
          </div>
        )}

        {error && (
          <div className="text-center text-red-400 text-sm mt-2">{error}</div>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
        {state === 'speaking' ? (
          <button
            onClick={stopSpeaking}
            className="w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 
                       flex items-center justify-center shadow-lg shadow-green-500/30"
          >
            <Volume2 className="w-8 h-8 text-white animate-pulse" />
          </button>
        ) : state === 'listening' ? (
          <button
            onClick={stopListening}
            className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 
                       flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-pulse"
          >
            <Mic className="w-8 h-8 text-white" />
          </button>
        ) : state === 'thinking' ? (
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 
                         flex items-center justify-center shadow-lg shadow-purple-500/30">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <button
            onClick={startListening}
            className="w-20 h-20 rounded-full bg-gradient-to-r from-slate-600 to-slate-700 
                       flex items-center justify-center shadow-lg
                       hover:from-cyan-500 hover:to-blue-600 hover:shadow-cyan-500/30
                       hover:scale-105 transition-all group"
          >
            <MicOff className="w-8 h-8 text-gray-400 group-hover:hidden" />
            <Mic className="w-8 h-8 text-white hidden group-hover:block" />
          </button>
        )}
      </div>

      <div className="absolute bottom-2 text-center">
        <span className="text-gray-600 text-sm">
          {state === 'sleeping' && isEnabled && 'Diga "Jarvis" ou clique no microfone'}
          {state === 'idle' && 'Diga "Jarvis" seguido do comando'}
          {state === 'listening' && 'Ouvindo... fale agora'}
          {state === 'thinking' && 'Processando com IA...'}
          {state === 'speaking' && 'Clique para interromper'}
        </span>
      </div>
    </div>
  )
}

export default Jarvis
