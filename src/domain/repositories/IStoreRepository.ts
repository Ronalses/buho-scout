import { Store } from "../entities/Store";

export interface IStoreRepository {
    save(store: Store): Promise<void>;
    findById(id: string): Promise<Store | null>;
    findPending(): Promise<Store | null>;
    updateStatus(id: string, status: 'pending' | 'processed' | 'error', error?: string): Promise<void>;
}
