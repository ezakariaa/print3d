import type { ProductCategory } from './products.js';

export type ProductOptionType = 'values' | 'text' | 'image';

export interface ProductOptionValue {
  id: string;
  label: string;
  imageUrl?: string;
  /** Amount added to the product price when this value is chosen (only if the category has pricedValues). */
  price?: number;
}

export interface ProductOptionCategory {
  id: string;
  title: string;
  values: ProductOptionValue[];
  /** When true, each value may carry an extra price. */
  pricedValues?: boolean;
  productCategories?: ProductCategory[];
  type?: ProductOptionType;
}
