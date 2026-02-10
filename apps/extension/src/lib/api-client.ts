import type {
  AddDownloadRequest,
  AddDownloadResponse,
  StatusResponse,
  Queue,
  Download,
} from '@/types';

// ============================================================================
// WebSocket event types — matches Rust WsEvent struct exactly
// ============================================================================

export interface WsEvent {
  type: string;
  id?: string;
  downloaded?: number;
  total?: number | null;
  speed?: number;
  eta?: number | null;
  status?: string;
  message?: string;
}

export type WsEventHandler = (event: WsEvent) => void;

export interface DlmanClientOptions {
  port: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onEvent?: WsEventHandler;
  onError?: (error: string) => void;
}

// ============================================================================
// DLMan Client
//
// Architecture:
//   HTTP REST is the PRIMARY transport for all commands.
//   WebSocket is OPTIONAL — used only for receiving real-time events
//   (progress, status changes) from the desktop app.
//   All actual operations (add, pause, resume, cancel, query) go through HTTP.
// ============================================================================

export class DlmanClient {
  private ws: WebSocket | null = null;
  private options: DlmanClientOptions;
  private isConnecting = false;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  constructor(options: DlmanClientOptions) {
    this.options = options;
  }

  private get baseUrl(): string {
    return `http://localhost:${this.options.port}`;
  }

  private get wsUrl(): string {
    return `ws://localhost:${this.options.port}/ws`;
  }

  /**
   * Whether the WebSocket is currently open.
   * Note: HTTP calls work even when WS is down.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ==========================================================================
  // WebSocket — event stream only
  // ==========================================================================

  /**
   * Open a WebSocket connection for real-time events.
   * Returns true if the WS connected successfully.
   */
  async connect(): Promise<boolean> {
    if (this.isConnecting || this.isConnected) {
      return this.isConnected;
    }

    this.isConnecting = true;
    this.intentionalClose = false;

    return new Promise<boolean>((resolve) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        const timeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.ws?.close();
            resolve(false);
          }
        }, 3000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[DLMan] WebSocket connected');
          this.isConnecting = false;
          this.startKeepalive();
          this.options.onConnect?.();
          resolve(true);
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          console.log('[DLMan] WebSocket closed');
          this.isConnecting = false;
          this.stopKeepalive();
          this.ws = null;
          if (!this.intentionalClose) {
            this.options.onDisconnect?.();
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          resolve(false);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = event.data as string;
            // Handle pong keepalive response
            if (data === '"pong"' || data === 'pong') {
              return;
            }
            const wsEvent: WsEvent = JSON.parse(data);
            this.handleWsEvent(wsEvent);
          } catch (error) {
            console.error('[DLMan] Failed to parse WS message:', error);
          }
        };
      } catch (error) {
        console.error('[DLMan] Failed to create WebSocket:', error);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  /**
   * Gracefully close the WebSocket.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopKeepalive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send periodic pings to keep the connection alive and detect stale sockets.
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('"ping"');
        } catch {
          // Socket dead — close will fire and trigger onDisconnect
          this.ws?.close();
        }
      }
    }, 25_000); // 25s — well within typical 30s idle timeouts
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Route incoming WS events to callbacks.
   */
  private handleWsEvent(event: WsEvent): void {
    switch (event.type) {
      case 'progress':
        if (event.id) {
          this.options.onEvent?.(event);
        }
        break;
      case 'status_changed':
      case 'download_added':
        this.options.onEvent?.(event);
        break;
      case 'error':
        this.options.onError?.(event.message || 'Unknown error');
        break;
      default:
        // Forward any unknown event types too
        this.options.onEvent?.(event);
    }
  }

  // ==========================================================================
  // HTTP REST — primary transport for all operations
  // ==========================================================================

  private async httpRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ==========================================================================
  // Public API — all go through HTTP
  // ==========================================================================

  /**
   * Quick health check — is the desktop app running?
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<StatusResponse | null> {
    try {
      return await this.httpRequest<StatusResponse>('GET', '/api/status');
    } catch {
      return null;
    }
  }

  async getQueues(): Promise<Queue[]> {
    try {
      return await this.httpRequest<Queue[]>('GET', '/api/queues');
    } catch (error) {
      console.error('[DLMan] Failed to get queues:', error);
      return [];
    }
  }

  async getDownloads(): Promise<Download[]> {
    try {
      return await this.httpRequest<Download[]>('GET', '/api/downloads');
    } catch (error) {
      console.error('[DLMan] Failed to get downloads:', error);
      return [];
    }
  }

  async addDownload(request: AddDownloadRequest): Promise<AddDownloadResponse> {
    try {
      return await this.httpRequest<AddDownloadResponse>('POST', '/api/downloads', request);
    } catch (error) {
      console.error('[DLMan] Failed to add download:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async pauseDownload(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.httpRequest<{ success: boolean; error?: string }>(
        'POST',
        `/api/downloads/${id}/pause`,
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async resumeDownload(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.httpRequest<{ success: boolean; error?: string }>(
        'POST',
        `/api/downloads/${id}/resume`,
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cancelDownload(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.httpRequest<{ success: boolean; error?: string }>(
        'POST',
        `/api/downloads/${id}/cancel`,
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let clientInstance: DlmanClient | null = null;

/**
 * Get or create the singleton DLMan client.
 * Options are only used when creating the first instance.
 */
export function getDlmanClient(options?: Partial<DlmanClientOptions>): DlmanClient {
  if (!clientInstance) {
    clientInstance = new DlmanClient({
      port: options?.port || 7899,
      ...options,
    });
  }
  return clientInstance;
}

/**
 * Reset the client (used when port changes or for testing).
 */
export function resetDlmanClient(): void {
  clientInstance?.disconnect();
  clientInstance = null;
}
