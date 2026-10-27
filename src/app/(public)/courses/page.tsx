import { CourseDirectory } from '@/components/campus/course-directory';
import type { Query } from '@/components/campus/content';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'شروحات المواد الدراسية من eStudy24', description: 'تصفح شروحات eStudy24 المتوفرة حسب جامعتك، وابحث باسم المادة بالعربية أو الإنجليزية.', alternates: { canonical: '/courses' } };
export default async function CoursesPage({ searchParams }: { searchParams: Promise<Query> }) {
  return <div className="space-y-6"><h1 className="text-3xl font-medium leading-[1.7]">ابحث عن شرح مادتك الجامعية</h1><CourseDirectory query={await searchParams} /></div>;
}
