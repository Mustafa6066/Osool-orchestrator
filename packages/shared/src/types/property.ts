/** Property type classification. */
export type PropertyType =
  | 'apartment'
  | 'villa'
  | 'townhouse'
  | 'duplex'
  | 'penthouse'
  | 'studio'
  | 'chalet'
  | 'commercial'
  | 'office';

/** Finishing level. */
export type FinishingLevel = 'core_shell' | 'semi_finished' | 'fully_finished' | 'furnished';

/** Delivery status. */
export type DeliveryStatus = 'off_plan' | 'under_construction' | 'ready_to_move';

/** Developer profile. */
export interface Developer {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  logo?: string;
  description?: string;
  descriptionAr?: string;
  founded?: number;
  projectCount: number;
  avgDeliveryRatePercent: number;
  avgPricePerSqm: number;
  regions: string[];
  tier: 'premium' | 'mid_market' | 'budget';
}

/** Real estate project. */
export interface Project {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  developerId: string;
  location: string;
  locationAr: string;
  region: string;
  type: PropertyType[];
  minPrice: number;
  maxPrice: number;
  avgPricePerSqm: number;
  currency: 'EGP' | 'USD';
  minArea: number;
  maxArea: number;
  bedrooms: number[];
  finishing: FinishingLevel;
  deliveryStatus: DeliveryStatus;
  deliveryDate?: Date;
  paymentPlanYears?: number;
  downPaymentPercent?: number;
  constructionProgressPercent: number;
  amenities: string[];
  description?: string;
  descriptionAr?: string;
  imageUrl?: string;
}

/** Price history data point. */
export interface PriceHistory {
  projectId: string;
  date: Date;
  avgPricePerSqm: number;
  minPrice: number;
  maxPrice: number;
}

/** Location with ROI data. */
export interface LocationROI {
  location: string;
  locationAr: string;
  slug: string;
  region: string;
  avgPricePerSqm: number;
  priceChange1y: number;
  priceChange3y: number;
  priceChange5y: number;
  rentalYieldPercent: number;
  liquidityScore: number;
  demandIndex: number;
}
