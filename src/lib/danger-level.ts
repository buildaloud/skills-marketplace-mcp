import type { DangerLevel } from '../types.js';

const TIERS: { max: number; label: DangerLevel }[] = [
  { max: 5,   label: 'low' },
  { max: 20,  label: 'medium' },
  { max: 50,  label: 'high' },
  { max: 100, label: 'critical' },
];

export function getDangerLevel(overallExposure: number): DangerLevel {
  return (TIERS.find((t) => overallExposure <= t.max) ?? TIERS[3]).label;
}
