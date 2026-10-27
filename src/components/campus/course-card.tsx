import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { COURSE_SUMMARY_FALLBACK, trustedCourseUrl } from '@/lib/course-catalog';
import { CourseImage } from './course-image';
import styles from './course-card.module.css';

export type CoursePreview = { id: string; title: string; description: string; imageUrl: string | null; destinationUrl: string; university: { name: string; slug: string } | null };
export function CourseCard({ course }: { course: CoursePreview }) {
  const titleId = `course-title-${course.id}`, href = trustedCourseUrl(course.destinationUrl);
  return <Card className={styles.card}><article className={styles.layout} aria-labelledby={titleId}>
    <div className={styles.thumbnail}><CourseImage url={course.imageUrl} title={course.title} /></div>
    <div className={styles.heading}><p className="text-xs leading-5 text-primary">{course.university?.name}</p><h3 id={titleId} className={`${styles.title} mt-1 text-[15px] font-medium leading-6`}>{course.title}</h3></div>
    <p dir="auto" className={`${styles.summary} line-clamp-2 text-xs leading-5 text-secondary-foreground`}>{course.description || COURSE_SUMMARY_FALLBACK}</p>
    {href && <div className={styles.action}><Button asChild size="sm" className="min-h-10 min-w-24"><a href={href} target="_blank" rel="noopener noreferrer external">عرض الشرح</a></Button></div>}
  </article></Card>;
}
