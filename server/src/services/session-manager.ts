export class SessionManager {
  private active = new Map<string, AbortController>();

  register(sessionId: string, controller: AbortController): void {
    const existing = this.active.get(sessionId);
    if (existing) {
      existing.abort();
    }
    this.active.set(sessionId, controller);
  }

  isActive(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  abort(sessionId: string): void {
    const controller = this.active.get(sessionId);
    if (controller) {
      controller.abort();
      this.active.delete(sessionId);
    }
  }

  unregister(sessionId: string): void {
    this.active.delete(sessionId);
  }

  abortAll(): void {
    for (const [, controller] of this.active) {
      controller.abort();
    }
    this.active.clear();
  }
}
