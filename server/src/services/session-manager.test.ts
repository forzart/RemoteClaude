import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('registers a session with an AbortController', () => {
    const controller = new AbortController();
    manager.register('my-session', 'sid-1', controller);
    expect(manager.isActive('my-session')).toBe(true);
  });

  it('returns false for unknown sessions', () => {
    expect(manager.isActive('unknown')).toBe(false);
  });

  it('aborts and removes a session', () => {
    const controller = new AbortController();
    manager.register('my-session', 'sid-1', controller);
    manager.abort('my-session');
    expect(controller.signal.aborted).toBe(true);
    expect(manager.isActive('my-session')).toBe(false);
  });

  it('unregisters a session without aborting', () => {
    const controller = new AbortController();
    manager.register('my-session', 'sid-1', controller);
    manager.unregister('my-session');
    expect(controller.signal.aborted).toBe(false);
    expect(manager.isActive('my-session')).toBe(false);
  });

  it('abort is a no-op for unknown sessions', () => {
    expect(() => manager.abort('unknown')).not.toThrow();
  });

  it('aborts all active sessions', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    manager.register('s1', 'sid-1', c1);
    manager.register('s2', 'sid-2', c2);
    manager.abortAll();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(manager.isActive('s1')).toBe(false);
    expect(manager.isActive('s2')).toBe(false);
  });

  it('tracks pending sessions and consumes them', () => {
    manager.registerPending('my-session', 'sid-1', false);
    expect(manager.isPending('my-session')).toBe(true);
    const entry = manager.consumePending('my-session');
    expect(entry).toEqual({ sessionId: 'sid-1', isResume: false });
    expect(manager.isPending('my-session')).toBe(false);
  });

  it('getSessionId returns id from active or pending', () => {
    manager.registerPending('my-session', 'sid-1', true);
    expect(manager.getSessionId('my-session')).toBe('sid-1');
    const controller = new AbortController();
    manager.register('my-session', 'sid-2', controller);
    expect(manager.getSessionId('my-session')).toBe('sid-2');
  });
});
