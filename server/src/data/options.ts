import type { ProductCategory } from './products.js';

export type ProductOptionType = 'values' | 'text' | 'image';

export interface ProductOptionValue {
  id: string;
  label: string;
  imageUrl?: string;
}

export interface ProductOptionCategory {
  id: string;
  title: string;
  values: ProductOptionValue[];
  productCategories?: ProductCategory[];
  type?: ProductOptionType;
}
