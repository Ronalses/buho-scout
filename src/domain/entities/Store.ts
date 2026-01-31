export class Store {
  constructor(
    public readonly id: string,
    public readonly url: string,
    public status: 'pending' | 'processed' | 'error',
    public lastError: string | null = null,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}
}
