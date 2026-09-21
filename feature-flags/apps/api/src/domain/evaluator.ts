import type { EvaluationContext, EvaluationResult, FeatureFlag } from './types.js';

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function evaluateFlag(flag: FeatureFlag, context: EvaluationContext = {}): EvaluationResult {
  for (const rule of flag.rules) {
    if (rule.type === 'attribute_equals') {
      const actual = context.attributes?.[rule.attribute];
      if (actual === rule.value) {
        return { flagKey: flag.key, value: rule.serve, matchedRule: rule, reason: 'attribute_equals', bucket: null };
      }
      continue;
    }

    const subject = context.userId ?? context.attributes?.userId;
    if (typeof subject !== 'string' || subject.length === 0) continue;
    const bucket = (hash(`${flag.key}:${subject}`) / 2 ** 32) * 100;
    if (bucket < rule.percentage) {
      return { flagKey: flag.key, value: rule.serve, matchedRule: rule, reason: 'percentage', bucket: Number(bucket.toFixed(4)) };
    }
    return { flagKey: flag.key, value: !rule.serve, matchedRule: rule, reason: 'percentage', bucket: Number(bucket.toFixed(4)) };
  }

  return { flagKey: flag.key, value: flag.defaultValue, matchedRule: null, reason: 'default', bucket: null };
}
