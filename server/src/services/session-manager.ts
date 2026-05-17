interface ActiveEntry {
  controller: AbortController;
  sessionId: string;
}

interface PendingEntry {
  sessionId: string;
  isResume: boolean;
}

export class SessionManager {
  private active = new Map<string, ActiveEntry>();
  private pending = new Map<string, PendingEntry>();

  registerPending(sessionName: string, sessionId: string, isResume = false): void {
    this.pending.set(sessionName, { sessionId, isResume });
  }

  isPending(sessionName: string): boolean {
    return this.pending.has(sessionName);
  }

  consumePending(sessionName: string): PendingEntry | undefined {
    const entry = this.pending.get(sessionName);
    if (entry) this.pending.delete(sessionName);
    return entry;
  }

  register(sessionName: string, sessionId: string, controller: AbortController): void {
    const existing = this.active.get(sessionName);
    if (existing) {
      existing.controller.abort();
    }
    this.active.set(sessionName, { controller, sessionId });
  }

  getSessionId(sessionName: string): string | undefined {
    return this.active.get(sessionName)?.sessionId ?? this.pending.get(sessionName)?.sessionId;
  }

  isActive(sessionName: string): boolean {
    return this.active.has(sessionName);
  }

  abort(sessionName: string): void {
    const entry = this.active.get(sessionName);
    if (entry) {
      entry.controller.abort();
      this.active.delete(sessionName);
    }
  }

  unregister(sessionName: string): void {
    this.active.delete(sessionName);
  }

  abortAll(): void {
    for (const [, entry] of this.active) {
      entry.controller.abort();
    }
    this.active.clear();
  }
}
