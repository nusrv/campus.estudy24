export function westernDigits(value: string) {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)));
}
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) { return new Intl.NumberFormat('en-US', { ...options, numberingSystem: 'latn' }).format(value); }
const dateOptions: Intl.DateTimeFormatOptions = { calendar: 'gregory', numberingSystem: 'latn', timeZone: 'Asia/Riyadh' };
export function formatDate(value: Date | string, options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }) { return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { ...dateOptions, ...options, numberingSystem: 'latn' }).format(new Date(value)); }
export function formatDateTime(value: Date | string, options: Intl.DateTimeFormatOptions = {}) { return formatDate(value, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options }); }
export function formatTime(value: Date | string, options: Intl.DateTimeFormatOptions = {}) { return formatDate(value, { hour: 'numeric', minute: '2-digit', ...options }); }
