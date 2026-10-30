/**
 * Système de notifications toast centralisé pour ClassPulse.
 * Léger, sans dépendance externe, accessible et anti-doublon.
 */

export type ToastType = "success" | "error" | "info" | "loading";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  createdAt: number;
}

export interface ToastOptions {
  id?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private lastDispatched: Map<string, number> = new Map();

  private emit() {
    const copy = [...this.toasts];
    this.listeners.forEach((listener) => listener(copy));
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getToasts(): ToastItem[] {
    return [...this.toasts];
  }

  show(type: ToastType, message: string, options?: ToastOptions): string {
    const key = `${type}:${message.trim()}`;
    const now = Date.now();
    const lastTime = this.lastDispatched.get(key);

    // Anti-rebond / anti-doublon : ignore les clics répétés identiques dans une fenêtre de 1500 ms
    if (lastTime && now - lastTime < 1500) {
      const existing = this.toasts.find((t) => t.type === type && t.message === message);
      if (existing) return existing.id;
    }
    this.lastDispatched.set(key, now);

    const id = options?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

    const defaultDuration = type === "error" ? 6000 : type === "loading" ? 0 : 4000;
    const duration = options?.duration ?? defaultDuration;

    const item: ToastItem = {
      id,
      type,
      message,
      duration,
      createdAt: now,
    };

    // Si un toast avec le même id existe, on le met à jour
    const existingIndex = this.toasts.findIndex((t) => t.id === id);
    if (existingIndex >= 0) {
      this.toasts[existingIndex] = item;
    } else {
      // Limite la pile à 5 toasts simultanés pour ne pas saturer l'écran
      if (this.toasts.length >= 5) {
        this.toasts.shift();
      }
      this.toasts.push(item);
    }

    this.emit();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  dismiss(id: string) {
    const index = this.toasts.findIndex((t) => t.id === id);
    if (index >= 0) {
      this.toasts.splice(index, 1);
      this.emit();
    }
  }

  clear() {
    this.toasts = [];
    this.emit();
  }

  success(message: string, options?: ToastOptions): string {
    return this.show("success", message, options);
  }

  error(message: string, options?: ToastOptions): string {
    return this.show("error", message, options);
  }

  info(message: string, options?: ToastOptions): string {
    return this.show("info", message, options);
  }

  loading(message: string, options?: ToastOptions): string {
    return this.show("loading", message, options);
  }
}

export const toast = new ToastManager();
