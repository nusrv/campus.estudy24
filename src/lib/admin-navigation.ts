export type AdminNavigationItem = { key: string; title: string; ownerOnly?: boolean; ambassador?: boolean };
export const adminNavigation: { key: string; title: string; items: AdminNavigationItem[] }[] = [
  { key: 'institutions', title: 'المؤسسات التعليمية', items: [
    { key: 'universities', title: 'الجامعات والكليات' }, { key: 'academic-programs', title: 'التخصصات الأكاديمية', ambassador: true }, { key: 'course-catalog?view=catalog', title: 'شروحات المواد', ownerOnly: true },
  ] },
  { key: 'content', title: 'المحتوى', items: [
    { key: 'articles', title: 'الأخبار والمقالات', ambassador: true }, { key: 'events', title: 'الفعاليات والمواعيد', ambassador: true }, { key: 'programs', title: 'البرامج التدريبية', ambassador: true }, { key: 'links', title: 'الروابط والخدمات', ambassador: true },
  ] },
  { key: 'marketing', title: 'التسويق', items: [{ key: 'ads', title: 'الإعلانات' }, { key: 'platform_posts', title: 'محتوى الصفحة الرئيسية' }] },
  { key: 'integrations', title: 'التكاملات', items: [{ key: 'sources', title: 'مصادر الاستيراد' }, { key: 'course-catalog', title: 'مزامنة eStudy24', ownerOnly: true }, { key: 'logs', title: 'سجل العمليات' }] },
  { key: 'administration', title: 'الإدارة والإعدادات', items: [{ key: 'administrators', title: 'المشرفون والصلاحيات', ownerOnly: true }, { key: 'platform-settings', title: 'إعدادات المنصة', ownerOnly: true }, { key: 'advanced', title: 'إعدادات متقدمة' }] },
];
export function navigationForRole(role: string) {
  if (!['owner', 'editor', 'ambassador'].includes(role)) return [];
  return adminNavigation.map(group => ({ ...group, items: group.items.filter(item => (!item.ownerOnly || role === 'owner') && (role !== 'ambassador' || item.ambassador)) })).filter(group => group.items.length);
}
export function activeNavigationKey(pathname: string, catalogView: boolean, mappingView = false) {
  const section = pathname.split('/')[2] || '';
  if (['categories', 'audit', 'api-docs'].includes(section) || (section === 'course-catalog' && mappingView)) return 'advanced';
  if (section === 'settings') return 'platform-settings';
  return section === 'course-catalog' && catalogView ? 'course-catalog?view=catalog' : section;
}
