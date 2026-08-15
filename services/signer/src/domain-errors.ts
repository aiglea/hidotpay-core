export class DomainError extends Error {
  public constructor(public readonly code: string) {
    super(code);
  }
}
