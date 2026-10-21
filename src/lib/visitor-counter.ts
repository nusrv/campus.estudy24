
import { formatNumber } from "./format.ts";
export const formatVisits = (value: number) => formatNumber(value);
export const displayedVisits = (startingValue: number, recordedVisits: number) => startingValue + recordedVisits;
