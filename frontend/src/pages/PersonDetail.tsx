import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, Person, Photo, Theme } from '../api'

export default function PersonDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const themeInputRef = useRef<HTMLInputElement>(null)

  const [person, setPerson] = useState<Person | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [theme, setTheme] = useState<Theme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingTheme, setUploadingTheme] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)

  useEffect(() => {
    if (name) {
      loadPersonData()
    }
  }, [name])

  async function loadPersonData() {
    if (!name) return

    try {
      setLoading(true)
      setError(null)

      const [personData, photosData] = await Promise.all([
        api.getPerson(name),
        api.listPhotos(name),
      ])

      setPerson(personData)
      setPhotos(photosData.photos)

      if (personData.has_theme) {
        try {
          const themeData = await api.getTheme(name)
          setTheme(themeData)
        } catch {
          // Theme might not exist
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person')
    } finally {
      setLoading(false)
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || !name) return

    setUploading(true)
    setError(null)

    try {
      for (const file of Array.from(files)) {
        await api.uploadPhoto(name, file)
      }
      await loadPersonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!name || !confirm('Delete this photo?')) return

    try {
      await api.deletePhoto(name, photoId)
      await loadPersonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete photo')
    }
  }

  async function handleSetPreview(photoId: string) {
    if (!name) return

    try {
      await api.setPreviewPhoto(name, photoId)
      await loadPersonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set preview')
    }
  }

  async function handleThemeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !name) return

    setUploadingTheme(true)
    setError(null)

    try {
      const themeData = await api.uploadTheme(name, file)
      setTheme(themeData)
      await loadPersonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload theme')
    } finally {
      setUploadingTheme(false)
      if (themeInputRef.current) {
        themeInputRef.current.value = ''
      }
    }
  }

  async function handleDeleteTheme() {
    if (!name || !confirm('Delete theme song?')) return

    try {
      await api.deleteTheme(name)
      setTheme(null)
      await loadPersonData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete theme')
    }
  }

  function playTheme() {
    if (!theme) return

    const audio = new Audio(theme.url)
    audio.play()
    setAudioPlaying(true)
    audio.onended = () => setAudioPlaying(false)
  }

  async function handleDeletePerson() {
    if (!name || !confirm(`Delete "${name}" and all their data?`)) return

    try {
      await api.deletePerson(name)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete person')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-stinger-muted">Loading...</div>
      </div>
    )
  }

  if (!person) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-medium text-white mb-2">Person not found</h3>
        <Link to="/" className="text-stinger-accent hover:underline">
          ← Back to People
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-stinger-muted hover:text-white transition-colors mb-6"
      >
        ← Back to People
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold text-white">{person.name}</h2>
          <p className="text-stinger-muted mt-1">
            {person.embedding_count} face embedding{person.embedding_count !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={handleDeletePerson} className="btn btn-danger">
          Delete Person
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-warning/20 border border-stinger-warning/50 text-stinger-warning">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Photos Section */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-display font-bold text-white">Photos</h3>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="btn btn-primary cursor-pointer inline-flex items-center gap-2"
                >
                  {uploading ? 'Uploading...' : '+ Add Photos'}
                </label>
              </div>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-12 text-stinger-muted">
                <div className="text-4xl mb-3">📷</div>
                <p>No photos yet. Upload face photos to enable recognition.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {photos.map((photo) => {
                  const isPreview = person?.preview_url?.includes(photo.id)
                  return (
                    <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-stinger-bg">
                      <img
                        src={photo.url}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleSetPreview(photo.id)}
                          className="px-3 py-1 bg-stinger-accent/80 text-black text-sm rounded hover:bg-stinger-accent transition-colors font-medium"
                          title="Set as gallery preview"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="px-3 py-1 bg-stinger-warning/80 text-white text-sm rounded hover:bg-stinger-warning transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                      {photo.has_embedding && (
                        <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-stinger-accent" title="Has embedding" />
                      )}
                      {isPreview && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-stinger-accent text-black text-xs rounded font-medium">
                          Preview
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Theme Section */}
        <div>
          <div className="card p-6">
            <h3 className="text-lg font-display font-bold text-white mb-6">Theme Song</h3>

            {theme ? (
              <div className="space-y-4">
                <div className="p-4 bg-stinger-bg rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-stinger-accent/20 flex items-center justify-center text-stinger-accent text-xl">
                      ♪
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{theme.filename}</p>
                      <p className="text-sm text-stinger-muted">Audio file</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={playTheme}
                    className="btn btn-primary flex-1"
                    disabled={audioPlaying}
                  >
                    {audioPlaying ? '▶ Playing...' : '▶ Preview'}
                  </button>
                  <button onClick={handleDeleteTheme} className="btn btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎵</div>
                <p className="text-stinger-muted mb-4">No theme song set</p>
                <input
                  ref={themeInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleThemeUpload}
                  className="hidden"
                  id="theme-upload"
                />
                <label
                  htmlFor="theme-upload"
                  className="btn btn-secondary cursor-pointer inline-block"
                >
                  {uploadingTheme ? 'Uploading...' : 'Upload Theme'}
                </label>
              </div>
            )}

            <p className="text-xs text-stinger-muted mt-4">
              Theme plays when this person is recognized (30s cooldown)
            </p>
          </div>

          {/* Stats */}
          <div className="card p-6 mt-6">
            <h3 className="text-lg font-display font-bold text-white mb-4">Stats</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Photos</dt>
                <dd className="text-white font-medium">{person.photo_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Embeddings</dt>
                <dd className="text-white font-medium">{person.embedding_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stinger-muted">Has Theme</dt>
                <dd className="text-white font-medium">{person.has_theme ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

