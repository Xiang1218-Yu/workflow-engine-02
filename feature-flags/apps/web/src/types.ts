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

export type Rule = AttributeEqualsRule | PercentageRule;

export type Flag = {
  key: string;
  name: string;
  description: string;
  defaultValue: boolean;
  rules: Rule[];
  createdAt: string;
  updatedAt: string;
};

export type FlagDraft = {
  key: string;
  name: string;
  description: string;
  defaultValue: boolean;
  rules: Array<{
    type: Rule['type'];
    attribute?: string;
    value?: Primitive;
    percentage?: number;
    serve: boolean;
  }>;
};

export type Evaluation = {
  flagKey: string;
  value: boolean;
  matchedRule: Rule | null;
  reason: 'attribute_equals' | 'percentage' | 'default';
  bucket: number | null;
};
