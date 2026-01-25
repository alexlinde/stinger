import { useState, useEffect, useRef, useCallback } from 'react'
import { api, KioskStatus, FaceMatch, MaskRect, parseCameraMasks, serializeCameraMasks } from '../api'
import { MaskEditor } from '../components/MaskEditor'

interface RecognitionMessage {
  type: 'recognition' | 'status' | 'heartbeat'
  faces?: FaceMatch[]
  themes_played?: { name: string; path: string }[]
  timestamp?: number
  process_time_ms?: number
  running?: boolean
  camera_connected?: boolean
  fps?: number
  people_count?: number
}

interface FaceHistoryEntry {
  name: string
  visibleSince: number
  lastSeen: number
  confidence: number
  themePlayed: boolean
}

export default function LiveView() {
  const [status, setStatus] = useState<KioskStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faceHistory, setFaceHistory] = useState<Map<string, FaceHistoryEntry>>(new Map())
  const [processTime, setProcessTime] = useState<number>(0)
  const [maskEditorOpen, setMaskEditorOpen] = useState(false)
  const [masks, setMasks] = useState<MaskRect[]>([])
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const historyCleanupRef = useRef<number | null>(null)

  // Load initial status and masks
  useEffect(() => {
    loadStatus()
    loadMasks()
  }, [])

  async function loadMasks() {
    try {
      const settings = await api.getSettings()
      setMasks(parseCameraMasks(settings.runtime.camera_masks))
    } catch (err) {
      console.error('Failed to load masks:', err)
    }
  }

  const handleSaveMasks = useCallback(async (newMasks: MaskRect[]) => {
    try {
      await api.updateSettings({ camera_masks: serializeCameraMasks(newMasks) })
      setMasks(newMasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save masks')
    }
  }, [])

  // Connect WebSocket
  useEffect(() => {
    connectWebSocket()
    
    // Cleanup interval to remove stale faces
    historyCleanupRef.current = window.setInterval(() => {
      setFaceHistory(prev => {
        const now = Date.now()
        const updated = new Map(prev)
        for (const [name, entry] of updated) {
          if (now - entry.lastSeen > 5000) {
            updated.delete(name)
          }
        }
        return updated
      })
    }, 1000)
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (historyCleanupRef.current) {
        clearInterval(historyCleanupRef.current)
      }
    }
  }, [])

  async function loadStatus() {
    try {
      const kioskStatus = await api.getKioskStatus()
      setStatus(kioskStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    }
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/kiosk/ws`
    
    try {
      wsRef.current = new WebSocket(wsUrl)
      
      wsRef.current.onopen = () => {
        console.log('Kiosk WebSocket connected')
        setConnected(true)
        setError(null)
      }
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: RecognitionMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (err) {
          console.error('Failed to parse message:', err)
        }
      }
      
      wsRef.current.onclose = () => {
        console.log('Kiosk WebSocket disconnected')
        setConnected(false)
        scheduleReconnect()
      }
      
      wsRef.current.onerror = () => {
        setError('WebSocket connection error')
      }
    } catch (err) {
      console.error('Failed to create WebSocket:', err)
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectWebSocket()
    }, 3000)
  }

  function handleMessage(message: RecognitionMessage) {
    if (message.type === 'recognition' && message.faces) {
      const now = Date.now()
      
      setFaceHistory(prev => {
        const updated = new Map(prev)
        
        for (const face of message.faces!) {
          if (!face.is_match) continue
          
          const confidence = 1 - face.distance
          const existing = updated.get(face.name)
          const themePlayed = message.themes_played?.some(t => t.name === face.name) || false
          
          if (existing) {
            updated.set(face.name, {
              ...existing,
              lastSeen: now,
              confidence: Math.max(existing.confidence, confidence),
              themePlayed: existing.themePlayed || themePlayed,
            })
          } else {
            updated.set(face.name, {
              name: face.name,
              visibleSince: now,
              lastSeen: now,
              confidence,
              themePlayed,
            })
          }
        }
        
        return updated
      })
      
      if (message.process_time_ms) {
        setProcessTime(message.process_time_ms)
      }
    }
    
    if (message.type === 'status' || message.type === 'heartbeat') {
      setStatus(prev => ({
        running: message.running ?? prev?.running ?? false,
        camera_connected: message.camera_connected ?? prev?.camera_connected ?? false,
        fps: message.fps ?? prev?.fps ?? 0,
        frame_count: prev?.frame_count ?? 0,
        people_count: message.people_count ?? prev?.people_count ?? 0,
      }))
    }
  }

  function formatVisibleSince(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    
    if (seconds < 5) {
      return 'Just arrived'
    } else if (seconds < 60) {
      return `Visible for ${seconds}s`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `Visible for ${minutes}m ${remainingSeconds}s`
    }
  }

  const sortedHistory = Array.from(faceHistory.values())
    .sort((a, b) => b.visibleSince - a.visibleSince)
    .slice(0, 8)

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Live View</h2>
          <p className="text-stinger-muted mt-1">
            Real-time face recognition from the kiosk camera
          </p>
        </div>
        
        {/* Status Indicators and Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMaskEditorOpen(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Edit Mask
          </button>
          <StatusBadge 
            label="Kiosk" 
            active={status?.running ?? false} 
          />
          <StatusBadge 
            label="Camera" 
            active={status?.camera_connected ?? false} 
          />
          <StatusBadge 
            label="WebSocket" 
            active={connected} 
          />
        </div>
      </div>

      {/* Mask Editor Modal */}
      <MaskEditor
        isOpen={maskEditorOpen}
        onClose={() => setMaskEditorOpen(false)}
        onSave={handleSaveMasks}
        initialMasks={masks}
      />

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-warning/20 border border-stinger-warning/50 text-stinger-warning">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Stream */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="aspect-video bg-stinger-bg relative">
              {status?.running && status?.camera_connected ? (
                <img
                  src="/api/kiosk/stream"
                  alt="Live Camera Feed"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-stinger-muted">
                  <div className="text-6xl mb-4">📷</div>
                  <p className="text-lg font-medium">
                    {!status?.running 
                      ? 'Kiosk not running'
                      : 'Camera not connected'
                    }
                  </p>
                  <p className="text-sm mt-2">
                    Check the server logs for details
                  </p>
                </div>
              )}
              
              {/* Overlay stats */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-stinger-accent">
                    {status?.fps?.toFixed(1) ?? 0} FPS
                  </span>
                  <span className="text-stinger-muted">
                    {processTime.toFixed(0)}ms recognition
                  </span>
                  <span className="text-stinger-muted">
                    {status?.people_count ?? 0} people in gallery
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Face History Panel */}
        <div>
          <div className="card p-6">
            <h3 className="text-lg font-display font-bold text-white mb-4">
              Recognized Faces
            </h3>
            
            {sortedHistory.length === 0 ? (
              <div className="text-center py-8 text-stinger-muted">
                <div className="text-4xl mb-3">👤</div>
                <p>No faces detected yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedHistory.map((entry) => (
                  <FaceCard key={entry.name} entry={entry} formatTime={formatVisibleSince} />
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="card p-6 mt-6">
            <h3 className="text-lg font-display font-bold text-white mb-4">Stats</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Kiosk Status</dt>
                <dd className={`font-medium ${status?.running ? 'text-stinger-accent' : 'text-stinger-warning'}`}>
                  {status?.running ? 'Running' : 'Stopped'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Camera</dt>
                <dd className={`font-medium ${status?.camera_connected ? 'text-stinger-accent' : 'text-stinger-warning'}`}>
                  {status?.camera_connected ? 'Connected' : 'Disconnected'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Frame Rate</dt>
                <dd className="text-white font-medium">{status?.fps?.toFixed(1) ?? 0} FPS</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Recognition</dt>
                <dd className="text-white font-medium">{processTime.toFixed(0)}ms</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
      active 
        ? 'bg-stinger-accent/20 text-stinger-accent' 
        : 'bg-stinger-warning/20 text-stinger-warning'
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        active ? 'bg-stinger-accent animate-pulse' : 'bg-stinger-warning'
      }`} />
      {label}
    </div>
  )
}

function FaceCard({ 
  entry, 
  formatTime 
}: { 
  entry: FaceHistoryEntry
  formatTime: (ts: number) => string 
}) {
  return (
    <div className="p-4 rounded-lg bg-stinger-bg border border-stinger-accent/30">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-bold text-stinger-accent text-lg">
          {entry.name}
        </span>
        {entry.themePlayed && (
          <span className="text-xs px-2 py-0.5 rounded bg-stinger-accent/20 text-stinger-accent">
            ♪ Theme Played
          </span>
        )}
      </div>
      <div className="text-sm text-stinger-muted space-y-1">
        <div>{formatTime(entry.visibleSince)}</div>
        <div>{(entry.confidence * 100).toFixed(0)}% confidence</div>
      </div>
    </div>
  )
}

