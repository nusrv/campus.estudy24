'use client';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { trustedCourseUrl } from '@/lib/course-catalog';
export function CourseImage({ url, title }: { url: string | null; title: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null), href = trustedCourseUrl(url, true);
  return <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-accent text-primary">{href && failedUrl !== href ? /* Check cached failures too: an SSR image can fail before hydration attaches onError. */ <img ref={image => { if (image?.complete && image.naturalWidth === 0) setFailedUrl(href); }} src={href} alt={`شرح ${title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailedUrl(href)} /> : <BookOpen className="size-10" aria-label="شرح من eStudy24" />}</div>;
}
