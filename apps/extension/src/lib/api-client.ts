import type {
  ApiMessage,
  MessageType,
  AddDownloadRequest,
  AddDownloadResponse,
  StatusResponse,
  Queue,
  Download,
  DownloadProgressEvent,
} from '@/types';
import { generateMessageId } from './utils';

type MessageHandler = (message: ApiMessage) => void;

export interface DlmanClientOptions {
  port: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onProgress?: (event: DownloadProgressEvent) => void;
  onError?: (error: string) => void;
}

/**
 * WebSocket + HTTP client for communicating with DLMan desktop app
 * Primary: WebSocket for real-time updates
 * Fallback: HTTP REST API
 */
export class DlmanClient {
  private ws: WebSocket | null = null;
  private options: DlmanClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private messageHandlers: MessageHandler[] = [];
  private isConnecting = false;

  constructor(options: DlmanClientOptions) {
    this.options = options;
  }

  /**
   * Get the base URL for HTTP requests
   */
  private get baseUrl(): string {
    return `http://localhost:${this.options.port}`;
  }

  /**
   * Get the WebSocket URL
   */
  private get wsUrl(): string {
    return `ws://localhost:${this.options.port}/ws`;
  }

  /**
   * Check if connected via WebSocket
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to DLMan via WebSocket
   */
  async connect(): Promise<boolean> {
    if (this.isConnecting || this.isConnected) {
      return this.isConnected;
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[DLMan] WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.options.onConnect?.();
          resolve(true);
        };

        this.ws.onclose = () => {
          console.log('[DLMan] WebSocket disconnected');
          this.isConnecting = false;
          this.ws = null;
          this.options.onDisconnect?.();
          this.attemptReconnect();
        };

        this.ws.onerror = (event) => {
          console.error('[DLMan] WebSocket error:', event);
          this.isConnecting = false;
          resolve(false);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ApiMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[DLMan] Failed to parse message:', error);
          }
        };

        // Timeout for connection
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.ws?.close();
            resolve(false);
          }
        }, 5000);
      } catch (error) {
        console.error('[DLMan] Failed to connect:', error);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from DLMan
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.ws?.close();
    this.ws = null;
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
    });
    this.pendingRequests.clear();
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[DLMan] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[DLMan] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: ApiMessage): void {
    // Check if this is a response to a pending request
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      
      if (message.type === 'error') {
        pending.reject(new Error((message.payload as { message?: string })?.message || 'Unknown error'));
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    // Handle broadcast messages
    switch (message.type) {
      case 'download_progress':
        this.options.onProgress?.(message.payload as DownloadProgressEvent);
        break;
      case 'error':
        this.options.onError?.((message.payload as { message?: string })?.message || 'Unknown error');
        break;
    }

    // Notify all handlers
    this.messageHandlers.forEach(handler => handler(message));
  }

  /**
   * Send a message via WebSocket and wait for response
   */
  private async sendMessage<T>(type: MessageType, payload?: unknown): Promise<T> {
    const message: ApiMessage = {
      id: generateMessageId(),
      type,
      payload,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to DLMan'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(message.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * Add a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  // ============================================================================
  // HTTP API (fallback when WebSocket not available)
  // ============================================================================

  /**
   * Make HTTP request to DLMan
   */
  private async httpRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check if DLMan is running
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

  /**
   * Get DLMan status
   */
  async getStatus(): Promise<StatusResponse | null> {
    try {
      if (this.isConnected) {
        return await this.sendMessage<StatusResponse>('get_status');
      }
      return await this.httpRequest<StatusResponse>('GET', '/api/status');
    } catch {
      return null;
    }
  }

  /**
   * Get all queues
   */
  async getQueues(): Promise<Queue[]> {
    try {
      if (this.isConnected) {
        return await this.sendMessage<Queue[]>('get_queues');
      }
      return await this.httpRequest<Queue[]>('GET', '/api/queues');
    } catch (error) {
      console.error('[DLMan] Failed to get queues:', error);
      return [];
    }
  }

  /**
   * Get all downloads
   */
  async getDownloads(): Promise<Download[]> {
    try {
      if (this.isConnected) {
        return await this.sendMessage<Download[]>('get_downloads');
      }
      return await this.httpRequest<Download[]>('GET', '/api/downloads');
    } catch (error) {
      console.error('[DLMan] Failed to get downloads:', error);
      return [];
    }
  }

  /**
   * Add a new download
   */
  async addDownload(request: AddDownloadRequest): Promise<AddDownloadResponse> {
    try {
      if (this.isConnected) {
        return await this.sendMessage<AddDownloadResponse>('add_download', request);
      }
      return await this.httpRequest<AddDownloadResponse>('POST', '/api/downloads', request);
    } catch (error) {
      console.error('[DLMan] Failed to add download:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
let clientInstance: DlmanClient | null = null;

/**
 * Get or create the DLMan client instance
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
 * Reset the client instance (for testing or port change)
 */
export function resetDlmanClient(): void {
  clientInstance?.disconnect();
  clientInstance = null;
}
