/**
 * API client for Stinger backend
 */

const API_BASE = '/api';

export interface Person {
  name: string;
  photo_count: number;
  embedding_count: number;
  has_theme: boolean;
  theme_filename: string | null;
  preview_url: string | null;
}

export interface PersonListResponse {
  people: Person[];
  total: number;
}

export interface Photo {
  id: string;
  filename: string;
  url: string;
  has_embedding: boolean;
}

export interface PhotoListResponse {
  photos: Photo[];
  total: number;
}

export interface Theme {
  filename: string;
  url: string;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskRect {
  x: number;       // Normalized x coordinate (0-1)
  y: number;       // Normalized y coordinate (0-1)
  width: number;   // Normalized width (0-1)
  height: number;  // Normalized height (0-1)
}

/**
 * Parse camera masks from JSON string
 */
export function parseCameraMasks(masksJson: string): MaskRect[] {
  if (!masksJson || !masksJson.trim()) {
    return [];
  }
  try {
    const masks = JSON.parse(masksJson);
    if (!Array.isArray(masks)) {
      return [];
    }
    return masks.filter(
      (m): m is MaskRect =>
        typeof m === 'object' &&
        m !== null &&
        typeof m.x === 'number' &&
        typeof m.y === 'number' &&
        typeof m.width === 'number' &&
        typeof m.height === 'number'
    );
  } catch {
    return [];
  }
}

/**
 * Serialize camera masks to JSON string
 */
export function serializeCameraMasks(masks: MaskRect[]): string {
  if (!masks || masks.length === 0) {
    return '';
  }
  return JSON.stringify(masks);
}

export interface FaceMatch {
  box: FaceBox;
  name: string;
  distance: number;
  is_match: boolean;
}

export interface RecognitionResult {
  faces: FaceMatch[];
  play_themes: { name: string; path: string }[];
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  people_count: number;
}

export interface KioskStatus {
  running: boolean;
  camera_connected: boolean;
  fps: number;
  frame_count: number;
  people_count: number;
  cuda_error: string | null;
}

/**
 * Read-only configuration settings (require restart to change)
 */
export interface ConfigSettings {
  host: string;
  port: number;
  debug: boolean;
  data_dir: string;
  insightface_model: string;
  camera_device: number;
  camera_width: number;
  camera_height: number;
  use_cuda: boolean;
  onnx_providers: string[];
  active_provider: string | null;
  cuda_error: string | null;
}

/**
 * Runtime settings that can be changed without restart
 */
export interface RuntimeSettings {
  detection_score_threshold: number;
  embedding_distance_threshold: number;
  upscale_factor: number;
  audio_cooldown_seconds: number;
  camera_fps: number;
  camera_masks: string;  // JSON string of MaskRect[]
  mirror_feed: boolean;
  kiosk_enabled: boolean;
  recognition_interval_ms: number;
  low_power_mode: boolean;
}

/**
 * Combined settings response from API
 */
export interface AllSettings {
  config: ConfigSettings;
  runtime: RuntimeSettings;
}

export interface RuntimeSettingsUpdate {
  detection_score_threshold?: number;
  embedding_distance_threshold?: number;
  upscale_factor?: number;
  audio_cooldown_seconds?: number;
  camera_fps?: number;
  camera_masks?: string;
  mirror_feed?: boolean;
  kiosk_enabled?: boolean;
  recognition_interval_ms?: number;
  low_power_mode?: boolean;
}

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  // Health
  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health');
  }

  // Kiosk
  async getKioskStatus(): Promise<KioskStatus> {
    return this.request<KioskStatus>('/kiosk/status');
  }

  // People
  async listPeople(): Promise<PersonListResponse> {
    return this.request<PersonListResponse>('/people');
  }

  async getPerson(name: string): Promise<Person> {
    return this.request<Person>(`/people/${encodeURIComponent(name)}`);
  }

  async createPerson(name: string): Promise<Person> {
    return this.request<Person>('/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async deletePerson(name: string): Promise<void> {
    return this.request<void>(`/people/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // Photos
  async listPhotos(personName: string): Promise<PhotoListResponse> {
    return this.request<PhotoListResponse>(
      `/people/${encodeURIComponent(personName)}/photos`
    );
  }

  async uploadPhoto(personName: string, file: File): Promise<Photo> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<Photo>(
      `/people/${encodeURIComponent(personName)}/photos`,
      {
        method: 'POST',
        body: formData,
      }
    );
  }

  async deletePhoto(personName: string, photoId: string): Promise<void> {
    return this.request<void>(
      `/people/${encodeURIComponent(personName)}/photos/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' }
    );
  }

  async setPreviewPhoto(personName: string, photoId: string): Promise<Person> {
    return this.request<Person>(
      `/people/${encodeURIComponent(personName)}/preview?photo_id=${encodeURIComponent(photoId)}`,
      { method: 'PUT' }
    );
  }

  // Theme
  async getTheme(personName: string): Promise<Theme> {
    return this.request<Theme>(
      `/people/${encodeURIComponent(personName)}/theme`
    );
  }

  async uploadTheme(personName: string, file: File): Promise<Theme> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<Theme>(
      `/people/${encodeURIComponent(personName)}/theme`,
      {
        method: 'PUT',
        body: formData,
      }
    );
  }

  async deleteTheme(personName: string): Promise<void> {
    return this.request<void>(
      `/people/${encodeURIComponent(personName)}/theme`,
      { method: 'DELETE' }
    );
  }

  // Recognition
  async recognizeImage(imageBase64: string): Promise<RecognitionResult> {
    return this.request<RecognitionResult>('/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });
  }

  // Settings
  async getSettings(): Promise<AllSettings> {
    return this.request<AllSettings>('/settings');
  }

  async updateSettings(updates: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
    return this.request<RuntimeSettings>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }
}

export const api = new ApiClient();

