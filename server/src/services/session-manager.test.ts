import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('registers a session with an AbortController', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    expect(manager.isActive('session-1')).toBe(true);
  });

  it('returns false for unknown sessions', () => {
    expect(manager.isActive('unknown')).toBe(false);
  });

  it('aborts and removes a session', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    manager.abort('session-1');
    expect(controller.signal.aborted).toBe(true);
    expect(manager.isActive('session-1')).toBe(false);
  });

  it('unregisters a session without aborting', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    manager.unregister('session-1');
    expect(controller.signal.aborted).toBe(false);
    expect(manager.isActive('session-1')).toBe(false);
  });

  it('abort is a no-op for unknown sessions', () => {
    expect(() => manager.abort('unknown')).not.toThrow();
  });

  it('aborts all active sessions', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    manager.register('s1', c1);
    manager.register('s2', c2);
    manager.abortAll();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(manager.isActive('s1')).toBe(false);
    expect(manager.isActive('s2')).toBe(false);
  });
});
