import { PrismaClient } from "@prisma/client";
import { IStoreRepository } from "../../domain/repositories/IStoreRepository";
import { Store } from "../../domain/entities/Store";
import { ShippingRate } from "../../domain/entities/ShippingRate";

export class PrismaStoreRepository implements IStoreRepository {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async save(store: Store): Promise<void> {
        await this.prisma.store.upsert({
            where: { id: store.id },
            update: {
                status: store.status,
                lastError: store.lastError,
                updatedAt: new Date()
            },
            create: {
                id: store.id,
                url: store.url,
                status: store.status,
                lastError: store.lastError,
                createdAt: store.createdAt,
                updatedAt: store.updatedAt
            }
        });
    }

    async findById(id: string): Promise<Store | null> {
        const pStore = await this.prisma.store.findUnique({ where: { id } });
        if (!pStore) return null;
        return new Store(
            pStore.id,
            pStore.url,
            pStore.status as "pending" | "processed" | "error",
            pStore.lastError,
            pStore.createdAt,
            pStore.updatedAt
        );
    }

    async findPending(): Promise<Store | null> {
        const pStore = await this.prisma.store.findFirst({
            where: { status: "pending" },
            orderBy: { createdAt: "asc" }
        });
        if (!pStore) return null;
        return new Store(
            pStore.id,
            pStore.url,
            pStore.status as "pending" | "processed" | "error",
            pStore.lastError,
            pStore.createdAt,
            pStore.updatedAt
        );
    }

    async updateStatus(
        id: string,
        status: "pending" | "processed" | "error",
        error?: string
    ): Promise<void> {
        await this.prisma.store.update({
            where: { id },
            data: {
                status,
                lastError: error || null
            }
        });
    }

    async saveRates(rates: ShippingRate[]): Promise<void> {
        for (const rate of rates) {
            await this.prisma.shippingRate.create({
                data: {
                    id: rate.id,
                    storeId: rate.storeId, // Ensure this ID relates to an existing Store
                    comuna: rate.comuna,
                    serviceName: rate.serviceName,
                    price: rate.price,
                    currency: rate.currency,
                    extractedAt: rate.extractedAt
                }
            });
        }
    }

    async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }
}
