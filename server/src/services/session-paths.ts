import { resolve } from 'path';
import { homedir } from 'os';

const REMOTE_CLAUDE_HOME = resolve(homedir(), '.remoteclaude');

export const SESSIONS_ROOT = resolve(REMOTE_CLAUDE_HOME, 'cwd');

export function sessionCwd(sessionName: string): string {
  return resolve(SESSIONS_ROOT, sessionName);
}
