// Discovery is independent of operational authorization, content and integration scope.
export const directoryVisibility = { enabled: true, showInDirectory: true } as const;
export const institutionTypes = ['UNIVERSITY', 'COLLEGE'] as const;
export function institutionLabel(type?: string) { return type === 'COLLEGE' ? 'كلية' : 'جامعة'; }
export const reconciliationInstitutions = [
  { categoryId: 287, name: 'جامعة الباحة', institutionType: 'UNIVERSITY', hints: ['الباحة', 'baha', 'bu'] },
  { categoryId: 159, name: 'جامعة تبوك', institutionType: 'UNIVERSITY', hints: ['تبوك', 'tabuk', 'ut'] },
  { categoryId: 310, name: 'كلية ينبع الصناعية', institutionType: 'COLLEGE', hints: ['ينبع', 'yanbu', 'yic'] },
] as const;
export const directoryHideSlugs = ['ksu', 'kku', 'taibah'] as const;
export function institutionalIdentity(value: string) {
  return value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().replace(/[\s_-]+/g, '');
}
export function possibleInstitution(row: { name: string; slug: string }, identity: typeof reconciliationInstitutions[number]) {
  const name = institutionalIdentity(row.name), slug = institutionalIdentity(row.slug);
  return name === institutionalIdentity(identity.name) || identity.hints.some(hint => (hint.length >= 4 && name.includes(institutionalIdentity(hint))) || slug === institutionalIdentity(hint));
}
