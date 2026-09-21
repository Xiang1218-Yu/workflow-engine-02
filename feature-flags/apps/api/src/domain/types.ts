export type Primitive = string | number | boolean;

export type AttributeEqualsRule = {
  id: string;
  type: 'attribute_equals';
  attribute: string;
  value: Primitive;
  serve: boolean;
};

export type PercentageRule = {
  id: string;
  type: 'percentage';
  percentage: number;
  serve: boolean;
};

export type FlagRule = AttributeEqualsRule | PercentageRule;

export type FeatureFlag = {
  key: string;
  name: string;
  description: string;
  defaultValue: boolean;
  rules: FlagRule[];
  createdAt: string;
  updatedAt: string;
};

export type CreateFlagInput = {
  key: string;
  name: string;
  description?: string;
  defaultValue: boolean;
  rules?: Array<
    | Omit<AttributeEqualsRule, 'id'>
    | Omit<PercentageRule, 'id'>
  >;
};

export type EvaluationContext = {
  userId?: string;
  attributes?: Record<string, Primitive | null | undefined>;
};

export type EvaluationResult = {
  flagKey: string;
  value: boolean;
  matchedRule: FlagRule | null;
  reason: 'attribute_equals' | 'percentage' | 'default';
  bucket: number | null;
};
