export const BULK_LIMIT = 5000;
export const bulkResources = ['articles', 'academic-programs', 'platform_posts', 'events', 'programs', 'links', 'ads', 'universities', 'sources', 'categories', 'administrators', 'api-keys', 'course-mappings'] as const;
export type BulkResource = typeof bulkResources[number];
export const actionLabels = { publish: 'نشر المحدد', unpublish: 'إلغاء نشر المحدد', hide: 'إخفاء المحدد', restore: 'استعادة المحدد', delete: 'حذف المحدد', enable: 'تفعيل المحدد', disable: 'تعطيل المحدد', activate: 'تنشيط المحدد', pause: 'إيقاف المحدد', archive: 'أرشفة المحدد', revoke: 'إلغاء المفاتيح المحددة' } as const;
export type BulkAction = keyof typeof actionLabels;
export function bulkActions(resource: string, role: string): BulkAction[] {
  if (!['owner', 'editor', 'ambassador'].includes(role)) return [];
  if (role === 'ambassador' && !['articles', 'academic-programs', 'events', 'programs', 'links'].includes(resource)) return [];
  if (['universities', 'sources', 'administrators', 'course-mappings'].includes(resource)) return role === 'owner' ? ['enable', 'disable'] : [];
  if (resource === 'api-keys') return role === 'owner' ? ['revoke'] : [];
  if (resource === 'categories') return role === 'owner' ? ['delete'] : [];
  const deletion: BulkAction[] = role === 'editor' ? [] : ['delete'];
  if (resource === 'ads') return ['activate', 'pause', 'archive', ...deletion];
  if (resource === 'links') return ['publish', 'unpublish', 'hide', 'enable', 'disable', ...deletion];
  if (['articles', 'academic-programs', 'platform_posts'].includes(resource)) return ['publish', 'unpublish', 'hide', 'restore', ...deletion];
  if (['events', 'programs'].includes(resource)) return ['publish', 'unpublish', 'hide', ...deletion];
  return [];
}
export function selectionCriteria(filters: Record<string, string>) { return JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([key, value]) => !['page', 'page_size'].includes(key) && value !== '').sort(([a], [b]) => a.localeCompare(b)))); }
export type Selection = { mode: 'ids'; ids: string[] } | { mode: 'all'; token: string; count: number; excluded: string[] };
export const emptySelection: Selection = { mode: 'ids', ids: [] };
export function selectedCount(s: Selection) { return s.mode === 'ids' ? s.ids.length : s.count - s.excluded.length; }
export function isSelected(s: Selection, id: string) { return s.mode === 'ids' ? s.ids.includes(id) : !s.excluded.includes(id); }
export function toggleSelection(s: Selection, ids: string[], checked: boolean): Selection {
  if (s.mode === 'ids') return { mode: 'ids', ids: checked ? [...new Set([...s.ids, ...ids])] : s.ids.filter(id => !ids.includes(id)) };
  return { ...s, excluded: checked ? s.excluded.filter(id => !ids.includes(id)) : [...new Set([...s.excluded, ...ids])] };
}
