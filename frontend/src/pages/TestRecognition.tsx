import { useState, useRef } from 'react'
import { api, RecognitionResult, FaceMatch } from '../api'

export default function TestRecognition() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)

    // Display the image
    const url = URL.createObjectURL(file)
    setImageUrl(url)

    // Convert to base64 and send for recognition
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      await recognizeImage(base64)
    }
    reader.readAsDataURL(file)
  }

  async function recognizeImage(base64: string) {
    setLoading(true)
    try {
      const recognitionResult = await api.recognizeImage(base64)
      setResult(recognitionResult)
      drawBoxes(recognitionResult.faces)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recognition failed')
    } finally {
      setLoading(false)
    }
  }

  function drawBoxes(faces: FaceMatch[]) {
    const canvas = canvasRef.current
    const img = document.getElementById('test-image') as HTMLImageElement
    if (!canvas || !img) return

    // Wait for image to load
    if (!img.complete) {
      img.onload = () => drawBoxes(faces)
      return
    }

    // Set canvas size to match displayed image
    canvas.width = img.offsetWidth
    canvas.height = img.offsetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calculate scale
    const scaleX = img.offsetWidth / img.naturalWidth
    const scaleY = img.offsetHeight / img.naturalHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const face of faces) {
      const x = face.box.x * scaleX
      const y = face.box.y * scaleY
      const w = face.box.width * scaleX
      const h = face.box.height * scaleY

      // Box color based on match
      const color = face.is_match ? '#00ff88' : '#ff4444'

      // Draw box
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)

      // Draw label background
      const label = face.is_match ? face.name : 'Unknown'
      const confidence = `${((1 - face.distance) * 100).toFixed(0)}%`
      const text = `${label} (${confidence})`

      ctx.font = 'bold 14px "JetBrains Mono", monospace'
      const textWidth = ctx.measureText(text).width

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.fillRect(x, y + h + 4, textWidth + 12, 24)

      ctx.fillStyle = color
      ctx.fillText(text, x + 6, y + h + 20)
    }
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-display font-bold text-white mb-2">Test Recognition</h2>
      <p className="text-stinger-muted mb-8">
        Upload an image to test face recognition
      </p>

      {/* Upload Area */}
      <div className="card p-8 mb-8">
        <div className="text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="test-image-upload"
          />
          <label
            htmlFor="test-image-upload"
            className="cursor-pointer block p-12 border-2 border-dashed border-white/20 rounded-xl hover:border-stinger-accent/50 transition-colors"
          >
            <div className="text-5xl mb-4">📷</div>
            <p className="text-white font-medium mb-2">
              Click to upload an image
            </p>
            <p className="text-sm text-stinger-muted">
              or drag and drop
            </p>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-stinger-warning/20 border border-stinger-warning/50 text-stinger-warning">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="text-2xl mb-2">🔍</div>
          <p className="text-stinger-muted">Analyzing faces...</p>
        </div>
      )}

      {/* Results */}
      {imageUrl && (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Image with boxes */}
          <div className="lg:col-span-2">
            <div className="card p-6">
              <h3 className="text-lg font-display font-bold text-white mb-4">Image</h3>
              <div className="relative inline-block">
                <img
                  id="test-image"
                  src={imageUrl}
                  alt="Test"
                  className="max-w-full rounded-lg"
                  onLoad={() => result && drawBoxes(result.faces)}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Results panel */}
          <div>
            <div className="card p-6">
              <h3 className="text-lg font-display font-bold text-white mb-4">
                Results
              </h3>

              {!result ? (
                <p className="text-stinger-muted">Processing...</p>
              ) : result.faces.length === 0 ? (
                <p className="text-stinger-muted">No faces detected</p>
              ) : (
                <div className="space-y-4">
                  {result.faces.map((face, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        face.is_match
                          ? 'bg-stinger-accent/10 border-stinger-accent/50'
                          : 'bg-stinger-warning/10 border-stinger-warning/50'
                      }`}
                    >
                      <div
                        className={`font-display font-bold text-lg ${
                          face.is_match ? 'text-stinger-accent' : 'text-stinger-warning'
                        }`}
                      >
                        {face.is_match ? face.name : 'Unknown'}
                      </div>
                      <div className="text-sm text-stinger-muted mt-1">
                        Confidence: {((1 - face.distance) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-stinger-muted mt-1">
                        Distance: {face.distance.toFixed(4)}
                      </div>
                    </div>
                  ))}

                  <div className="pt-4 border-t border-white/10 text-sm text-stinger-muted">
                    <p>
                      Threshold: 0.6 (distance)
                    </p>
                    <p className="mt-1">
                      Faces detected: {result.faces.length}
                    </p>
                    <p>
                      Matches: {result.faces.filter(f => f.is_match).length}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

