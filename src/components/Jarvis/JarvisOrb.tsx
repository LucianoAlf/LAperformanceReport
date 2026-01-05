import { useEffect, useRef } from 'react'

interface JarvisOrbProps {
  state: 'sleeping' | 'idle' | 'listening' | 'thinking' | 'speaking'
  audioVolume?: number
}

export function JarvisOrb({ state, audioVolume = 0 }: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 300
    canvas.width = size
    canvas.height = size

    const centerX = size / 2
    const centerY = size / 2
    let time = 0

    const colors = {
      sleeping: { primary: '#1e3a5f', secondary: '#0c1929', glow: 'rgba(30, 58, 95, 0.2)' },
      idle: { primary: '#0891b2', secondary: '#164e63', glow: 'rgba(8, 145, 178, 0.3)' },
      listening: { primary: '#06b6d4', secondary: '#0891b2', glow: 'rgba(6, 182, 212, 0.5)' },
      thinking: { primary: '#a855f7', secondary: '#7c3aed', glow: 'rgba(168, 85, 247, 0.5)' },
      speaking: { primary: '#10b981', secondary: '#059669', glow: 'rgba(16, 185, 129, 0.5)' }
    }

    const draw = () => {
      ctx.clearRect(0, 0, size, size)
      
      const speed = state === 'sleeping' ? 0.005 : 
                    state === 'idle' ? 0.01 : 
                    state === 'listening' ? 0.03 :
                    state === 'thinking' ? 0.04 : 0.025
      time += speed

      const color = colors[state]
      const baseRadius = state === 'sleeping' ? 70 : 80
      
      const volumeBoost = state === 'speaking' ? audioVolume * 30 : 0
      const pulseAmount = state === 'sleeping' ? 2 : 
                          state === 'idle' ? 5 : 
                          state === 'listening' ? 15 : 
                          state === 'thinking' ? 10 : 12 + volumeBoost

      // Glow externo
      const glowSize = state === 'speaking' ? 60 + volumeBoost : state === 'sleeping' ? 30 : 50
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius + glowSize)
      gradient.addColorStop(0, color.glow)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)

      // Ondas de áudio quando falando
      if (state === 'speaking') {
        for (let i = 0; i < 4; i++) {
          const waveRadius = baseRadius + 30 + (audioVolume * 40) + Math.sin(time * 3 + i * 0.7) * 15 + i * 12
          const alpha = (0.4 - i * 0.1) * (0.5 + audioVolume * 0.5)
          
          ctx.beginPath()
          ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`
          ctx.lineWidth = 2 + audioVolume * 2
          ctx.stroke()
        }
      }

      // Círculos de onda (listening)
      if (state === 'listening') {
        for (let i = 0; i < 3; i++) {
          const waveRadius = baseRadius + 30 + Math.sin(time * 2 + i * 0.5) * 20 + i * 15
          const alpha = 0.3 - i * 0.1
          
          ctx.beginPath()
          ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2)
          ctx.strokeStyle = color.primary.replace(')', `, ${alpha})`).replace('rgb', 'rgba')
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Partículas girando (thinking)
      if (state === 'thinking') {
        const particleCount = 12
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2 + time * 2
          const radius = baseRadius + 20 + Math.sin(time * 3 + i) * 10
          const x = centerX + Math.cos(angle) * radius
          const y = centerY + Math.sin(angle) * radius
          
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = i % 2 === 0 ? color.primary : color.secondary
          ctx.fill()
        }
      }

      // Ondas suaves para sleeping
      if (state === 'sleeping') {
        for (let i = 0; i < 2; i++) {
          const waveRadius = baseRadius + 10 + Math.sin(time + i) * 5 + i * 10
          const alpha = 0.1 - i * 0.03
          
          ctx.beginPath()
          ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `${color.primary}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Círculo principal pulsante
      const pulse = Math.sin(time * (state === 'sleeping' ? 0.5 : state === 'idle' ? 1 : 2)) * pulseAmount
      const radius = baseRadius + pulse

      // Gradiente do círculo
      const circleGradient = ctx.createRadialGradient(
        centerX - 20, centerY - 20, 0,
        centerX, centerY, radius
      )
      circleGradient.addColorStop(0, color.primary)
      circleGradient.addColorStop(1, color.secondary)

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = circleGradient
      ctx.fill()

      // Borda brilhante
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.strokeStyle = color.primary
      ctx.lineWidth = state === 'speaking' ? 3 + audioVolume * 2 : state === 'sleeping' ? 1 : 2
      ctx.stroke()

      // Brilho interno
      const innerGlow = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius * 0.8
      )
      innerGlow.addColorStop(0, `rgba(255, 255, 255, ${state === 'sleeping' ? 0.1 : 0.3})`)
      innerGlow.addColorStop(1, 'transparent')

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = innerGlow
      ctx.fill()

      // Núcleo central
      const coreSize = state === 'sleeping' ? 8 : state === 'speaking' ? 15 + audioVolume * 8 : 15
      const corePulse = state === 'sleeping' ? 1 : 3
      ctx.beginPath()
      ctx.arc(centerX, centerY, coreSize + Math.sin(time * 3) * corePulse, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${state === 'sleeping' ? 0.5 : 0.9})`
      ctx.fill()

      // "Olho" piscando para sleeping
      if (state === 'sleeping') {
        const blinkPhase = Math.sin(time * 0.3)
        if (blinkPhase > 0.95) {
          ctx.beginPath()
          ctx.arc(centerX, centerY, 5, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(6, 182, 212, 0.8)'
          ctx.fill()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [state, audioVolume])

  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        className="w-[300px] h-[300px]"
      />
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center">
        <span className={`text-sm font-mono uppercase tracking-wider ${
          state === 'sleeping' ? 'text-slate-500' :
          state === 'idle' ? 'text-cyan-600' :
          state === 'listening' ? 'text-cyan-400' :
          state === 'thinking' ? 'text-purple-400' :
          'text-emerald-400'
        }`}>
          {state === 'sleeping' && 'Standby - Listening for "Jarvis"'}
          {state === 'idle' && 'Ready'}
          {state === 'listening' && 'Listening'}
          {state === 'thinking' && 'Processing'}
          {state === 'speaking' && 'Speaking'}
        </span>
      </div>
    </div>
  )
}

export default JarvisOrb
