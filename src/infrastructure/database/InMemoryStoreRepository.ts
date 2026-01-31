import { IStoreRepository } from "../../domain/repositories/IStoreRepository";
import { Store } from "../../domain/entities/Store";
import { ShippingRate } from "../../domain/entities/ShippingRate";

export class InMemoryStoreRepository implements IStoreRepository {
    private stores: Map<string, Store> = new Map();
    private rates: ShippingRate[] = [];

    async save(store: Store): Promise<void> {
        this.stores.set(store.id, store);
    }

    async findById(id: string): Promise<Store | null> {
        return this.stores.get(id) || null;
    }

    async findPending(): Promise<Store | null> {
        // Return first pending store
        for (const store of this.stores.values()) {
            if (store.status === 'pending') return store;
        }
        return null;
    }

    async updateStatus(
        id: string,
        status: "pending" | "processed" | "error",
        error?: string
    ): Promise<void> {
        const store = this.stores.get(id);
        if (store) {
            store.status = status;
            store.lastError = error || null;
            store.updatedAt = new Date();
            this.stores.set(id, store);
        }
    }

    async saveRates(rates: ShippingRate[]): Promise<void> {
        this.rates.push(...rates);
        console.log(`[InMemoryDB] Saved ${rates.length} rates.`);
    }

    async disconnect(): Promise<void> {
        // No-op
    }
}
