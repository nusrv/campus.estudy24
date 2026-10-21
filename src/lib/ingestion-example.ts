export function ingestionExample(slug: string, websiteUrl: string) {
  return { university_slug: slug, source_id: 'integration-example-replace-with-original-id', source_key: `${slug}-rss`, source_url: websiteUrl, title: 'مثال اختبار تكامل — يُستبدل بعنوان الخبر الأصلي', summary: '', content_text: '', published_at: null, image_urls: [], pdf_urls: [], registration_links: [], category: 'general' };
}
