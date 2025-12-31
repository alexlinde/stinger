import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, Person } from '../api'

export default function PeopleList() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadPeople()
  }, [])

  async function loadPeople() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.listPeople()
      setPeople(response.people)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!newPersonName.trim()) return

    try {
      setAdding(true)
      await api.createPerson(newPersonName.trim())
      setNewPersonName('')
      setShowAddModal(false)
      await loadPeople()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add person')
    } finally {
      setAdding(false)
    }
  }

  async function handleDeletePerson(name: string) {
    if (!confirm(`Delete "${name}" and all their photos/theme?`)) return

    try {
      await api.deletePerson(name)
      await loadPeople()
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

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">People</h2>
          <p className="text-stinger-muted mt-1">
            {people.length} {people.length === 1 ? 'person' : 'people'} in gallery
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Add Person
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-warning/20 border border-stinger-warning/50 text-stinger-warning">
          {error}
        </div>
      )}

      {/* Empty State */}
      {people.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">👤</div>
          <h3 className="text-xl font-medium text-white mb-2">No people yet</h3>
          <p className="text-stinger-muted mb-6">
            Add your first person to start face recognition
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            Add First Person
          </button>
        </div>
      )}

      {/* People Grid */}
      {people.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {people.map((person) => (
            <PersonCard
              key={person.name}
              person={person}
              onDelete={() => handleDeletePerson(person.name)}
            />
          ))}
        </div>
      )}

      {/* Add Person Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <h3 className="text-xl font-display font-bold text-white mb-6">
              Add New Person
            </h3>
            <form onSubmit={handleAddPerson}>
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Enter name..."
                className="input mb-6"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={adding}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={adding || !newPersonName.trim()}
                >
                  {adding ? 'Adding...' : 'Add Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PersonCard({ person, onDelete }: { person: Person; onDelete: () => void }) {
  return (
    <div className="card overflow-hidden group">
      <Link to={`/person/${encodeURIComponent(person.name)}`}>
        {/* Photo Preview */}
        <div className="aspect-square bg-stinger-bg relative overflow-hidden">
          {person.preview_url ? (
            <img
              src={person.preview_url}
              alt={person.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                // Fallback to placeholder if image fails
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center text-6xl text-stinger-muted">
            {!person.preview_url && '👤'}
          </div>
          
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="font-display font-bold text-lg text-white group-hover:text-stinger-accent transition-colors">
            {person.name}
          </h3>
          <div className="flex items-center gap-4 mt-2 text-sm text-stinger-muted">
            <span>{person.photo_count} photo{person.photo_count !== 1 ? 's' : ''}</span>
            {person.has_theme && (
              <span className="flex items-center gap-1 text-stinger-accent">
                ♪ Theme
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Delete Button */}
      <div className="px-4 pb-4">
        <button
          onClick={(e) => {
            e.preventDefault()
            onDelete()
          }}
          className="text-sm text-stinger-muted hover:text-stinger-warning transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

