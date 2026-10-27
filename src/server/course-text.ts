import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { catalogSearch, COURSE_SUMMARY_FALLBACK } from '../lib/course-catalog.ts';
const blocks = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul']);
const discarded = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'template', 'form', 'button', 'input', 'select', 'textarea', 'video', 'audio', 'canvas']);
const whitespace = (value: string) => value.replace(/[\s\u0000-\u001f\u007f]+/gu, ' ').trim();

// Parse inert HTML once. Preserve inline text exactly (including codes split across
// emphasis tags), and keep block/line boundaries instead of inventing sentences.
function htmlBlocks(html: string, summary: boolean) {
  type Node = DefaultTreeAdapterMap['node'];
  const root = parseFragment(html), output: string[] = [];
  const stack: { node: Node; exit?: boolean }[] = [{ node: root }];
  while (stack.length) {
    const { node, exit } = stack.pop()!;
    if ('value' in node) { output.push(node.value); continue; }
    if (!('childNodes' in node)) continue;
    const tag = 'tagName' in node ? node.tagName : '', boundary = blocks.has(tag);
    if (exit) { if (boundary) output.push('\n'); continue; }
    const attrs = 'attrs' in node ? Object.fromEntries(node.attrs.map(a => [a.name, a.value])) : {};
    if (discarded.has(tag) || summary && (['nav', 'footer', 'header'].includes(tag) || 'hidden' in attrs || attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style || ''))) { output.push('\n'); continue; }
    if (summary && tag === 'a') {
      const href = (attrs.href || '').replace(/\s/g, '');
      if (/^(?:mailto:|tel:)|(?:youtu\.be|youtube\.com|t\.me|telegram\.(?:me|org)|wa\.me|whatsapp\.com)(?:[/:?#]|$)/i.test(href)) { output.push(' '); continue; }
      // Other academic anchor labels remain text; href attributes are never output.
    }
    if (boundary) output.push('\n');
    stack.push({ node, exit: true });
    for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({ node: node.childNodes[i] });
  }
  return output.join('').split(/\n+/).map(whitespace).filter(Boolean);
}

export function coursePlainText(html: string) { return whitespace(htmlBlocks(html, false).join(' ')); }

// Applied BEFORE sentence segmentation: dots in domains must never become prose.
const linkBoundary = /https?\s*:\s*\/\s*\/|www\s*\.|(?:youtu\s*\.\s*be|youtube\s*\.\s*com|t\s*\.\s*me|telegram\s*\.\s*(?:me|org)|wa\s*\.\s*me)\s*\/|\b(?:be|me)\/[A-Za-z0-9_-]{4,}|\?(?:si|v|utm_[a-z]+)=|[\w.+-]{1,64}@[\w.-]{1,253}\.[a-z]{2,24}/i;
const commercialBoundary = /(?:ال)?[اأإآ]شتراك|[اأإ]شترك|سعر\s*(?:المقرر|الدور[ةه]|الماد[ةه])|السعر\s*[:：]|(?:طريق[ةه]|وسائل)\s*(?:الشراء|الدفع)|(?:شراء|دفع)\s*(?:المقرر|المبلغ|الرسوم)|رسوم\s*(?:التسجيل|المقرر|الدور[ةه]|[:：\d٠-٩])|(?:استرداد|استرجاع)\s*(?:المبلغ|الرسوم)|غير\s*مسترد|refund|subscri(?:be|ption)|enroll|checkout|\bprice\s*[:\d$]|\b(?:SAR|USD)\b|ريال|دولار|[$€£]/i;
const unwanted = /(?:التواصل|تواصل)\s*(?:مع|عبر)|للتواصل|الدعم الفني|فريق الدعم|الدعم عبر|خدم[ةه] العملاء|للاستفسار|استفسارات|المشتركين|جروب|مجموع[ةه]\s*(?:الطلاب|الدعم|تلغرام|تيليجرام|whatsapp)|ت[يل]?[يل]?جرام|تلغرام|واتس|تسريبات|تجميعات|تابع الشرح التجريبي|طريق[ةه] التسجيل|سجل الان|انضم|عرض حصري|افضل منص[ةه]|مرحبا بك|اهلا بك|ملاحظ[ةه]|customer support|contact|whatsapp|telegram|youtube|youtu|click here|sign up/i;
const generic = /^(?:شرح مسجل للمنهج كامل|شرح الواجبات|مراجعات قبل|الشرح التجريبي|تعرف علي منص[ةه]|شروحات مميز[ةه]|شرح تعليمي|شرح المقرر كامل)[.!؟\s]*$/i;
const residue = /https?|www\s*\.|\.[a-z]{2,}(?:\/|\b)|\b(?:be|me)\/|[?&][a-z_]+=|[<>]|\[\/?[a-z_][^\]]*\]|\?{2,}|#{2,}|\*{2,}/i;
const dangling = /(?:مقرر|مادة|منهج|دورة|حول|من خلال|course covers|course includes|about|with|of)\s*[:،-]?$/i;

function introduction(html: string): string | null {
  const candidates: string[] = [];
  for (const block of htmlBlocks(html, true)) {
    const link = block.search(linkBoundary), promotion = block.search(commercialBoundary), boilerplate = block.search(unwanted);
    const cutoff = Math.min(...[link, promotion, boilerplate].filter(n => n >= 0), block.length);
    let text = whitespace(block.slice(0, cutoff));
    // Avoid keeping a price amount immediately before a currency boundary.
    if (promotion >= 0 && /^(?:ريال|دولار|SAR|USD)/i.test(block.slice(promotion))) text = text.replace(/[\d٠-٩۰-۹]+(?:[.,][\d٠-٩۰-۹]+)?\s*$/, '').trim();
    const normalized = catalogSearch(text);
    if (text && text.replace(/[^\p{L}]/gu, '').length >= 10 && text.split(/\s+/).length >= 3 && !unwanted.test(normalized) && !generic.test(normalized) && !residue.test(text) && !dangling.test(normalized)) candidates.push(text);
    // Nothing in a subscription/refund section is an independent course introduction.
    if (promotion >= 0 || candidates.length >= 2) break;
  }
  if (!candidates.length) return null;
  const selected: string[] = [];
  for (const part of new Intl.Segmenter('ar', { granularity: 'sentence' }).segment(candidates.join(' '))) {
    selected.push(part.segment.trim());
    if (selected.length === 2) break;
  }
  const sentences = selected.join(' ');
  if (sentences.length <= 360) return sentences;
  const end = sentences.lastIndexOf(' ', 359);
  return end > 0 ? sentences.slice(0, end).replace(/[،؛:–-]+$/, '').trim() + '…' : null;
}

export function courseSummary(contentHtml: string, excerptHtml = '') {
  return introduction(contentHtml) || introduction(excerptHtml) || COURSE_SUMMARY_FALLBACK;
}
