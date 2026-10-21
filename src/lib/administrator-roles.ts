export const administratorRoles = [
  { value: 'owner', label: 'مدير المنصة' },
  { value: 'editor', label: 'محرر' },
  { value: 'ambassador', label: 'سفير جامعة' },
] as const;
export function administratorRoleLabel(role: string) { return administratorRoles.find(item => item.value === role)?.label || 'حساب غير معروف'; }
