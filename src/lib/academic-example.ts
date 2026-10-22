// Illustrative schema sample only; never university seed data or an official program claim.
export function academicExample(universitySlug = 'uqu', website = 'https://uqu.edu.sa') {
  const sourceUrl = universitySlug === 'uqu' ? 'https://uqu.edu.sa/App/Degrees' : new URL(website).origin;
  return { university_slug: universitySlug, source_key: `${universitySlug}-degrees`, source_id: 'ILLUSTRATIVE-VARIANT-ID-001', name: 'مثال توضيحي لاسم برنامج — ليس سجلًا أكاديميًا رسميًا', degree_name: null, college: null, department: null, campus: null, credit_hours: null, study_mode: null, tuition_info: null, tuition_verified: false, tuition_source_url: null, description: null, source_url: sourceUrl, official_program_url: null, study_plan_url: null };
}
