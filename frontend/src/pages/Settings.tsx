import { useState, useEffect, useCallback } from 'react'
import { api, ConfigSettings, RuntimeSettings, MaskRect, parseCameraMasks, serializeCameraMasks } from '../api'
import { MaskEditor } from '../components/MaskEditor'

interface RuntimeSettingField {
  key: keyof RuntimeSettings
  label: string
  description: string
  type: 'text' | 'number' | 'boolean'
  min?: number
  max?: number
  step?: number
}

interface RuntimeSettingGroup {
  title: string
  icon: string
  fields: RuntimeSettingField[]
}

// Editable runtime settings groups
const runtimeSettingGroups: RuntimeSettingGroup[] = [
  {
    title: 'Face Recognition',
    icon: '👁️',
    fields: [
      { key: 'detection_score_threshold', label: 'Detection Threshold', description: 'Face detection confidence (0.0-1.0)', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
      { key: 'embedding_distance_threshold', label: 'Match Threshold', description: 'Face matching strictness (lower = stricter)', type: 'number', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'upscale_factor', label: 'Upscale Factor', description: 'Image upscale for better detection', type: 'number', min: 1.0, max: 4.0, step: 0.1 },
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
      { key: 'camera_fps', label: 'Target FPS', description: 'Target frames per second for camera capture', type: 'number', min: 1, max: 60 },
      { key: 'mirror_feed', label: 'Mirror Feed', description: 'Flip the video feed horizontally (selfie mode)', type: 'boolean' },
    ],
  },
  {
    title: 'Performance',
    icon: '⚡',
    fields: [
      { key: 'low_power_mode', label: 'Low Power Mode', description: 'Enable adaptive performance for slower hardware', type: 'boolean' },
    ],
  },
]

export default function Settings() {
  const [configSettings, setConfigSettings] = useState<ConfigSettings | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({})
  const [maskEditorOpen, setMaskEditorOpen] = useState(false)
  const [masks, setMasks] = useState<MaskRect[]>([])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getSettings()
      setConfigSettings(data.config)
      setRuntimeSettings(data.runtime)
      setEditedValues({})
      setMasks(parseCameraMasks(data.runtime.camera_masks))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSaveMasks = useCallback(async (newMasks: MaskRect[]) => {
    try {
      const updated = await api.updateSettings({ camera_masks: serializeCameraMasks(newMasks) })
      setRuntimeSettings(updated)
      setMasks(newMasks)
      setSuccess('Masks saved!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save masks')
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleChange = (key: keyof RuntimeSettings, value: string | number | boolean) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const getValue = (key: keyof RuntimeSettings): string | number | boolean => {
    if (key in editedValues) {
      return editedValues[key]
    }
    return runtimeSettings ? runtimeSettings[key] : ''
  }

  const hasChanges = Object.keys(editedValues).length > 0

  const handleSave = async () => {
    if (!hasChanges) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      const updated = await api.updateSettings(editedValues)
      setRuntimeSettings(updated)
      setEditedValues({})
      setSuccess('Settings saved!')
      setTimeout(() => setSuccess(null), 3000)
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

  if (!configSettings || !runtimeSettings) {
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

      {/* Mask Editor Modal */}
      <MaskEditor
        isOpen={maskEditorOpen}
        onClose={() => setMaskEditorOpen(false)}
        onSave={handleSaveMasks}
        initialMasks={masks}
      />

      {/* System Configuration (Read-only) */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">🖥️</span>
          <div>
            <h3 className="text-lg font-display font-bold text-white">System Configuration</h3>
            <p className="text-xs text-stinger-muted">Read-only settings configured in .env file</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConfigItem label="Host" value={configSettings.host} />
          <ConfigItem label="Port" value={configSettings.port} />
          <ConfigItem label="Debug" value={configSettings.debug ? 'Enabled' : 'Disabled'} />
          <ConfigItem label="Data Dir" value={configSettings.data_dir} />
          <ConfigItem label="Model" value={configSettings.insightface_model} />
          <ConfigItem label="Camera" value={`Device ${configSettings.camera_device}`} />
          <ConfigItem label="Resolution" value={`${configSettings.camera_width}x${configSettings.camera_height}`} />
        </div>
      </div>

      {/* Camera Masks Section */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📷</span>
            <div>
              <h3 className="text-lg font-display font-bold text-white">Camera Masks</h3>
              <p className="text-xs text-stinger-muted">Define regions to exclude from face detection</p>
            </div>
          </div>
          <button
            onClick={() => setMaskEditorOpen(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Edit Masks
            {masks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-stinger-accent/20 text-stinger-accent">
                {masks.length}
              </span>
            )}
          </button>
        </div>
        {masks.length === 0 ? (
          <p className="text-sm text-stinger-muted">No masks defined. Click "Edit Masks" to add regions to exclude.</p>
        ) : (
          <p className="text-sm text-stinger-muted">{masks.length} mask region{masks.length > 1 ? 's' : ''} defined.</p>
        )}
      </div>

      {/* Runtime Settings Groups */}
      <div className="space-y-6">
        {runtimeSettingGroups.map((group) => (
          <div key={group.title} className="card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">{group.icon}</span>
              <h3 className="text-lg font-display font-bold text-white">{group.title}</h3>
            </div>
            <div className="grid gap-4">
              {group.fields.map((field) => (
                <RuntimeSettingRow
                  key={field.key}
                  field={field}
                  value={getValue(field.key)}
                  originalValue={runtimeSettings[field.key]}
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

// Read-only config item display
function ConfigItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-stinger-bg/50 rounded-lg p-3">
      <div className="text-xs text-stinger-muted mb-1">{label}</div>
      <div className="text-sm text-white font-mono truncate">{value}</div>
    </div>
  )
}

interface RuntimeSettingRowProps {
  field: RuntimeSettingField
  value: string | number | boolean
  originalValue: string | number | boolean
  onChange: (value: string | number | boolean) => void
}

function RuntimeSettingRow({ field, value, originalValue, onChange }: RuntimeSettingRowProps) {
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

