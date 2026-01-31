import { ShippingRate } from "../entities/ShippingRate";

export interface IScraper {
    scrapeStore(url: string, locations: string[]): Promise<ShippingRate[]>;
}
