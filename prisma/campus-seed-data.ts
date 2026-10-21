// Official university homepages reviewed 2026-10-21; see docs/INTEGRATIONS.md.
export const SAUDI_UNIVERSITIES = [
  { slug: 'uqu', name: 'جامعة أم القرى', websiteUrl: 'https://uqu.edu.sa' },
  { slug: 'ksu', name: 'جامعة الملك سعود', websiteUrl: 'https://ksu.edu.sa' },
  { slug: 'kau', name: 'جامعة الملك عبدالعزيز', websiteUrl: 'https://www.kau.edu.sa' },
  { slug: 'imamu', name: 'جامعة الإمام محمد بن سعود الإسلامية', websiteUrl: 'https://imamu.edu.sa' },
  { slug: 'pnu', name: 'جامعة الأميرة نورة بنت عبدالرحمن', websiteUrl: 'https://pnu.edu.sa' },
  { slug: 'kku', name: 'جامعة الملك خالد', websiteUrl: 'https://www.kku.edu.sa' },
  { slug: 'taibah', name: 'جامعة طيبة', websiteUrl: 'https://www.taibahu.edu.sa' },
  { slug: 'qu', name: 'جامعة القصيم', websiteUrl: 'https://www.qu.edu.sa' },
  { slug: 'iau', name: 'جامعة الإمام عبدالرحمن بن فيصل', websiteUrl: 'https://www.iau.edu.sa' },
  { slug: 'jazanu', name: 'جامعة جازان', websiteUrl: 'https://www.jazanu.edu.sa' },
] as const;
export const demoAdId = (slug: string) => `campus-demo-${slug}-v1`;
