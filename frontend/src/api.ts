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
}

export interface Settings {
  // Server
  host: string;
  port: number;
  debug: boolean;
  // Paths
  data_dir: string;
  people_dir: string;
  // Face recognition
  detection_score_threshold: number;
  embedding_distance_threshold: number;
  upscale_factor: number;
  // Audio
  audio_cooldown_seconds: number;
  // Model
  insightface_model: string;
  // Camera
  camera_device: number;
  camera_width: number;
  camera_height: number;
  camera_fps: number;
  // Kiosk
  kiosk_enabled: boolean;
  recognition_interval_ms: number;
  // Performance
  low_power_mode: boolean;
  skip_upscale_retry: boolean;
  min_recognition_interval_ms: number;
  max_recognition_interval_ms: number;
  target_process_time_ms: number;
}

export interface SettingsUpdate {
  [key: string]: string | number | boolean | undefined;
}

export interface PendingChange {
  setting: string;
  current: string | number | boolean;
  pending: string;
}

export interface RestartStatus {
  restart_required: boolean;
  pending_changes: PendingChange[];
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
  async getSettings(): Promise<Settings> {
    return this.request<Settings>('/settings');
  }

  async updateSettings(updates: SettingsUpdate): Promise<Settings> {
    return this.request<Settings>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async checkRestartRequired(): Promise<RestartStatus> {
    return this.request<RestartStatus>('/settings/restart-required', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();

