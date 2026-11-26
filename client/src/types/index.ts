export type ProductCategory = 'ready' | 'customizable';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  price: number;
  category: ProductCategory;
  material: string;
  colors: string[];
  imageGradient: string;
  images?: string[];
  tags: string[];
  active?: boolean;
  /** Creation date (ISO 8601), from the server. */
  createdAt?: string;
  customOptions?: {
    text?: boolean;
    color?: boolean;
    size?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface ProductOptionValue {
  id: string;
  label: string;
  imageUrl?: string;
}

export type ProductOptionType = 'values' | 'text' | 'image';

export interface ProductOptionCategory {
  id: string;
  title: string;
  values: ProductOptionValue[];
  productCategories?: ProductCategory[];
  type?: ProductOptionType;
}

export interface Service {
  id: string;
  title: string;
  summary: string;
  details: string[];
  fromPrice: number;
  unit: string;
  icon: string;
}

export interface CartCustomization {
  text?: string;
  color?: string;
  size?: string;
  options?: Array<{
    categoryId: string;
    categoryTitle: string;
    type?: ProductOptionType;
    value: string;
    imageUrl?: string;
  }>;
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  imageGradient: string;
  imageUrl?: string;
  customization?: CartCustomization;
}
