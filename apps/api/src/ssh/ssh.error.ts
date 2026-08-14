export class SshError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly remoteOutput?: string,
  ) {
    super(message);
    this.name = 'SshError';
  }
}
