import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coursePlainText, courseSummary } from '../src/server/course-text.ts';
import { parseCourse } from '../src/server/course-source.ts';
import { COURSE_SUMMARY_FALLBACK } from '../src/lib/course-catalog.ts';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/course-catalog/verified-description-html.json', import.meta.url), 'utf8'));

test('verified public source retains complete coded titles and meaningful section labels', () => {
  const expected: Record<number,string> = { 30920: 'جبر خطي (MTH1441) -القسم الأول', 31006: 'جبر خطي (MTH1441) -القسم الثاني', 29168: '(EE2102T) دوائر الكترونية -القسم الاول', 22239: 'معادلات تفاضلية و جبر خطي -القسم الاول', 8277: 'كيمياء الكم 447CHEM' };
  for (const raw of fixture.records) { const c = parseCourse(raw); assert.equal(c.title, coursePlainText(raw.title.rendered)); if(expected[raw.id]) assert.equal(c.title,expected[raw.id]); assert.equal(c.sourceTitle,c.title); }
});

test('verified chemistry URL corruption is replaced by its actual source introduction', () => {
  const raw = fixture.records.find((r:{id:number})=>r.id===9182); assert.match(raw.content.rendered,/https:\/\/youtu\.be\/2o2ptwAGP6Y/); assert.match(raw.content.rendered,/الدعم الفني<a/);
  assert.equal(parseCourse(raw).description,'تتضمن هذه الدروس شرح مقرر الكيمياء الحيوية');
  for (const raw of fixture.records) { const text = parseCourse(raw).description; assert.ok(text.length>10); assert.doesNotMatch(text,/https?|youtu|t\s*\.\s*me|\?si=|be\/|ريال|اشتراك|مسترد|الدعم|التواصل|التسريبات|[<>]/i); }
});

test('HTML5 entities, malformed tags, inline codes, Unicode and long titles are never rewritten or sliced', () => {
  assert.equal(coursePlainText('  جبر&nbsp;خطي <em>(MTH1441)</em> &#8211; القسم&nbsp;الثاني  '),'جبر خطي (MTH1441) – القسم الثاني');
  assert.equal(coursePlainText('(EE<strong>2102T</strong>) دوائر &amp; تطبيقات'),'('+ 'EE2102T) دوائر & تطبيقات');
  assert.equal(coursePlainText('<b>شرح &NotEqualTilde; &copy; &#x1F4D8;</b>'),'شرح ≂̸ © 📘');
  const title='جبر خطي (MTH1441) — القسم ٢ '.repeat(30).trim(); const raw={...fixture.records[0],title:{rendered:title}}; assert.equal(parseCourse(raw).title,title); assert.ok(parseCourse(raw).title.length>500);
});

test('structured content is preferred to a flattened promotional excerpt; an appropriate excerpt is a fallback', () => {
  const introduction='تتناول هذه المادة مبادئ الجبر الخطي وتطبيقاته.';
  assert.equal(courseSummary(`<p>${introduction}</p><p>اشتراك المقرر 175 ريال</p>`, '<p>https://youtu.be/code – الدعم الفنيhttps://t.me/test</p>'),introduction);
  assert.equal(courseSummary('<p>اشتراك المقرر كامل 175 ريال</p>',`<p>${introduction}</p>`),introduction);
  assert.equal(courseSummary('', '<p>تتضمن هذه الدروس شرح مقرر الكيمياء الحيوية اشتراك المقرر 240 ريال https://youtu.be/video الدعم الفنيhttps://t.me/test</p>'),'تتضمن هذه الدروس شرح مقرر الكيمياء الحيوية');
});

test('anchors and block boundaries preserve academic text without leaking contact or media links', () => {
  const html='<p>تتناول هذه المادة <a href="https://example.edu/academic">مبادئ الجبر</a> وتطبيقاته.<p>التواصل مع الدعم الفني<a href="https://t.me/eStudy_24">https://t.me/eStudy_24</a><p>طريقة الاشتراك <a href="https://youtu.be/video">شاهد الفيديو</a>';
  assert.equal(courseSummary(html),'تتناول هذه المادة مبادئ الجبر وتطبيقاته.');
  assert.equal(courseSummary('<p>تتناول هذه المادة <strong>الجبر</strong> و<span>التفاضل</span>.<br>اشتراك 100 ريال</p>'),'تتناول هذه المادة الجبر والتفاضل.');
});

test('bare URLs, shortened fragments, malformed spacing and adjacent contact text produce no broken links', () => {
  for (const text of ['https://youtu.be/2o2ptwAGP6Y?si=nPvfoEfk763gJGK – التواصل مع الدعم الفنيhttps://t. me/eStudy_24','be/2o2ptwAGP6Y?si=nPvfoEfk763gJGK – الدعم الفني','t . me / eStudy_24','<a href="https://youtu.be/2o2ptwAGP6Y">youtu.be/2o2ptwAGP6Y</a>','الدعم الفنيhttps://t.me/eStudy_24','تواصل مع فريق eStudy24 على تيليجرام','support@example.com','<p>Telegram support and subscription details</p>']) assert.equal(courseSummary(text),COURSE_SUMMARY_FALLBACK,text);
  assert.equal(courseSummary('<p>شرح مفاهيم التفاضل وتطبيقاتها. https://youtu.be/video?si=test</p>'),'شرح مفاهيم التفاضل وتطبيقاتها.');
  assert.equal(courseSummary('<p>شرح مفاهيم التفاضل وتطبيقاتها. التواصل مع الدعم الفنيhttps://t. me/eStudy_24</p>'),'شرح مفاهيم التفاضل وتطبيقاتها.');
});

test('scripts, styles, hidden elements, comments, forms and embedded media remain inert and excluded', () => {
  assert.equal(courseSummary('<script>steal()</script><style>body{}</style><!--comment--><p hidden>نص مخفي للمقرر</p><iframe>فيديو المقرر</iframe><form>طلب اشتراك</form><p>تشرح هذه الدروس مفاهيم التفاضل وتطبيقاتها.</p>'),'تشرح هذه الدروس مفاهيم التفاضل وتطبيقاتها.');
  assert.equal(courseSummary('<p>اشتراك 175 ريال</p><p>شرح مسجل للمنهج كامل</p><p>المبلغ غير مسترد</p>'),COURSE_SUMMARY_FALLBACK);
  for (const html of ['', '<p> </p>', '<img src=x onerror=alert(1)>', '<p>شرح مسجل للمنهج كامل</p>', '<p>الدعم الفني والمشتركين في جروب التلغرام</p>']) assert.equal(courseSummary(html),COURSE_SUMMARY_FALLBACK);
});

test('summaries keep academic punctuation and decimals, and end at a word boundary when long', () => {
  const meaningful='This course explains numerical methods with accuracy 3.14 and practical applications.'; assert.equal(courseSummary(`<p>${meaningful}</p>`),meaningful);
  const summary=courseSummary(`<p>تتناول هذه المادة ${'مفاهيم علمية وتطبيقات عملية '.repeat(40)}</p>`); assert.ok(summary.length<=361); assert.match(summary,/…$/); assert.doesNotMatch(summary,/https|اشتراك/);
});

test('commercial rules do not mistake academic graphics, momentum, retrieval, sets or support vectors for sales copy', () => {
  for(const text of ['تتناول هذه المادة نظرية الرسوم البيانية وتطبيقاتها.', 'تشرح هذه الدروس مفاهيم الدفع والزخم في الفيزياء.', 'تتناول هذه المادة استرجاع المعلومات في قواعد البيانات.', 'تشرح هذه المادة مجموعة الأعداد الحقيقية وتطبيقاتها.', 'تتناول هذه المادة آلات متجهات الدعم في تعلم الآلة.', 'تتناول هذه المادة مهارات التواصل المهني وتطبيقاتها.', 'This course explains price elasticity in economic theory.']) assert.equal(courseSummary(`<p>${text}</p><p>اشتراك المقرر 175 ريال</p>`),text);
  assert.equal(courseSummary('<p>تتضمن هذه الدروس شرح مقرر https://youtu.be/video</p>'),COURSE_SUMMARY_FALLBACK);
});
