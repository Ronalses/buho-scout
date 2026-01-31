export class ShippingRate {
    constructor(
        public readonly id: string,
        public readonly storeId: string,
        public readonly comuna: string,
        public readonly serviceName: string,
        public readonly price: number,
        public readonly currency: string = "CLP",
        public readonly extractedAt: Date
    ) { }
}
