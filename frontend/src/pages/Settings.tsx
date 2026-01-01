import { useState, useEffect, useCallback } from 'react'
import { api, Settings as SettingsType, PendingChange } from '../api'

interface SettingField {
  key: keyof SettingsType
  label: string
  description: string
  type: 'text' | 'number' | 'boolean' | 'select'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

interface SettingGroup {
  title: string
  icon: string
  fields: SettingField[]
}

const settingGroups: SettingGroup[] = [
  {
    title: 'Server',
    icon: '🖥️',
    fields: [
      { key: 'host', label: 'Host', description: 'Server bind address', type: 'text' },
      { key: 'port', label: 'Port', description: 'Server port number', type: 'number', min: 1, max: 65535 },
      { key: 'debug', label: 'Debug Mode', description: 'Enable verbose logging', type: 'boolean' },
    ],
  },
  {
    title: 'Camera',
    icon: '📷',
    fields: [
      { key: 'camera_device', label: 'Device Index', description: 'Camera device number (0 = default)', type: 'number', min: 0, max: 10 },
      { key: 'camera_width', label: 'Width', description: 'Capture width in pixels', type: 'number', min: 320, max: 3840, step: 160 },
      { key: 'camera_height', label: 'Height', description: 'Capture height in pixels', type: 'number', min: 240, max: 2160, step: 120 },
      { key: 'camera_fps', label: 'FPS', description: 'Target frames per second', type: 'number', min: 1, max: 60 },
    ],
  },
  {
    title: 'Face Recognition',
    icon: '👁️',
    fields: [
      { key: 'detection_score_threshold', label: 'Detection Threshold', description: 'Face detection confidence (0.0-1.0)', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
      { key: 'embedding_distance_threshold', label: 'Match Threshold', description: 'Face matching strictness (lower = stricter)', type: 'number', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'upscale_factor', label: 'Upscale Factor', description: 'Image upscale for better detection', type: 'number', min: 1.0, max: 4.0, step: 0.1 },
      { key: 'insightface_model', label: 'Model', description: 'InsightFace model name', type: 'select', options: [
        { value: 'buffalo_l', label: 'Buffalo L (Best Quality)' },
        { value: 'buffalo_m', label: 'Buffalo M (Balanced)' },
        { value: 'buffalo_s', label: 'Buffalo S (Fastest)' },
        { value: 'buffalo_sc', label: 'Buffalo SC (Smallest)' },
      ]},
    ],
  },
  {
    title: 'Audio',
    icon: '🔊',
    fields: [
      { key: 'audio_cooldown_seconds', label: 'Cooldown', description: 'Seconds between theme plays for same person', type: 'number', min: 0, max: 300, step: 5 },
    ],
  },
  {
    title: 'Kiosk Mode',
    icon: '🖼️',
    fields: [
      { key: 'kiosk_enabled', label: 'Enabled', description: 'Enable automatic face recognition', type: 'boolean' },
      { key: 'recognition_interval_ms', label: 'Recognition Interval', description: 'Milliseconds between recognition attempts', type: 'number', min: 50, max: 2000, step: 50 },
    ],
  },
  {
    title: 'Performance',
    icon: '⚡',
    fields: [
      { key: 'low_power_mode', label: 'Low Power Mode', description: 'Reduce CPU usage on slower hardware', type: 'boolean' },
      { key: 'skip_upscale_retry', label: 'Skip Upscale Retry', description: 'Skip retry with upscaling when no face found', type: 'boolean' },
      { key: 'min_recognition_interval_ms', label: 'Min Interval', description: 'Minimum recognition interval (ms)', type: 'number', min: 50, max: 500, step: 25 },
      { key: 'max_recognition_interval_ms', label: 'Max Interval', description: 'Maximum recognition interval (ms)', type: 'number', min: 200, max: 5000, step: 100 },
      { key: 'target_process_time_ms', label: 'Target Process Time', description: 'Target processing time before throttling (ms)', type: 'number', min: 50, max: 500, step: 25 },
    ],
  },
  {
    title: 'Paths',
    icon: '📁',
    fields: [
      { key: 'data_dir', label: 'Data Directory', description: 'Path to data storage', type: 'text' },
      { key: 'people_dir', label: 'People Directory', description: 'Path to people photos', type: 'text' },
    ],
  },
]

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({})

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getSettings()
      setSettings(data)
      setEditedValues({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const checkPendingChanges = useCallback(async () => {
    try {
      const status = await api.checkRestartRequired()
      setPendingChanges(status.pending_changes)
    } catch {
      // Ignore errors checking restart status
    }
  }, [])

  useEffect(() => {
    loadSettings()
    checkPendingChanges()
  }, [loadSettings, checkPendingChanges])

  const handleChange = (key: keyof SettingsType, value: string | number | boolean) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const getValue = (key: keyof SettingsType): string | number | boolean => {
    if (key in editedValues) {
      return editedValues[key]
    }
    return settings ? settings[key] : ''
  }

  const hasChanges = Object.keys(editedValues).length > 0

  const handleSave = async () => {
    if (!hasChanges) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      await api.updateSettings(editedValues)
      setEditedValues({})
      setSuccess('Settings saved! Restart the server for changes to take effect.')
      await checkPendingChanges()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setEditedValues({})
    setSuccess(null)
    setError(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-stinger-muted">Loading settings...</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-stinger-warning">Failed to load settings</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Settings</h2>
          <p className="text-stinger-muted mt-1">
            Configure Stinger behavior
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="btn btn-secondary"
              disabled={saving}
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            className={`btn ${hasChanges ? 'btn-primary' : 'btn-secondary opacity-50'}`}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Pending Changes Banner */}
      {pendingChanges.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-xl">⚠️</span>
            <div>
              <h4 className="font-medium text-amber-400">Restart Required</h4>
              <p className="text-sm text-amber-300/80 mt-1">
                {pendingChanges.length} setting{pendingChanges.length > 1 ? 's have' : ' has'} been changed but require{pendingChanges.length === 1 ? 's' : ''} a server restart to take effect.
              </p>
              <div className="mt-2 text-xs text-amber-300/60 font-mono">
                {pendingChanges.map(c => c.setting).join(', ')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-accent/10 border border-stinger-accent/30 text-stinger-accent">
          {success}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-warning/20 border border-stinger-warning/50 text-stinger-warning">
          {error}
        </div>
      )}

      {/* Settings Groups */}
      <div className="space-y-6">
        {settingGroups.map((group) => (
          <div key={group.title} className="card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">{group.icon}</span>
              <h3 className="text-lg font-display font-bold text-white">{group.title}</h3>
            </div>
            <div className="grid gap-4">
              {group.fields.map((field) => (
                <SettingRow
                  key={field.key}
                  field={field}
                  value={getValue(field.key)}
                  originalValue={settings[field.key]}
                  onChange={(value) => handleChange(field.key, value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Save Bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 bg-stinger-surface/95 backdrop-blur-lg border-t border-white/10 p-4 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-stinger-muted">
              {Object.keys(editedValues).length} unsaved change{Object.keys(editedValues).length > 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleReset} className="btn btn-secondary" disabled={saving}>
                Discard
              </button>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Spacer for bottom bar */}
      {hasChanges && <div className="h-20" />}
    </div>
  )
}

interface SettingRowProps {
  field: SettingField
  value: string | number | boolean
  originalValue: string | number | boolean
  onChange: (value: string | number | boolean) => void
}

function SettingRow({ field, value, originalValue, onChange }: SettingRowProps) {
  const isModified = value !== originalValue

  return (
    <div className={`flex items-center justify-between gap-4 p-3 rounded-lg transition-colors ${isModified ? 'bg-stinger-accent/5 border border-stinger-accent/20' : 'bg-stinger-bg/50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label className="font-medium text-white text-sm">{field.label}</label>
          {isModified && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-stinger-accent/20 text-stinger-accent">
              modified
            </span>
          )}
        </div>
        <p className="text-xs text-stinger-muted mt-0.5 truncate">{field.description}</p>
      </div>
      <div className="flex-shrink-0">
        {field.type === 'boolean' ? (
          <button
            onClick={() => onChange(!value)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              value ? 'bg-stinger-accent' : 'bg-stinger-muted/30'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        ) : field.type === 'select' ? (
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="bg-stinger-bg border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-stinger-accent focus:outline-none w-48"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : field.type === 'number' ? (
          <input
            type="number"
            value={value as number}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={field.min}
            max={field.max}
            step={field.step}
            className="bg-stinger-bg border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-right focus:border-stinger-accent focus:outline-none w-28"
          />
        ) : (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="bg-stinger-bg border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-stinger-accent focus:outline-none w-48"
          />
        )}
      </div>
    </div>
  )
}

