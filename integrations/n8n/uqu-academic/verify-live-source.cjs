/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
// Read-only, opt-in source verification. It has NO Campus submission implementation.
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { initial, sourceRequest, sourceResponse, finalizeCollection, summary } = require('./collector.cjs');
async function main() {
  if (!process.argv.includes('--fetch-official-source')) throw new Error('Opt in using --fetch-official-source. No Campus writes are possible.');
  let state = initial();
  while (state.phase === 'collect') {
    state = sourceRequest(state); let response;
    try {
      const res = await fetch(state.requestUrl, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: 'text/html', 'User-Agent': 'CampusAcademicDirectory/1.0 (+https://github.com/nusrv/campus.estudy24)' } });
      const body = await res.text(); response = { statusCode: res.status, headers: Object.fromEntries(res.headers), body };
      if (res.status === 200) {
        // Never persist full pages: they include login components, CSRF tokens and unrelated assets.
        const table = body.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
        if (table) {
          const footer = body.slice(body.indexOf(table) + table.length).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          const range = footer.match(/عرض\s+\d+\s+إلى\s+\d+\s+من\s+أصل\s+\d+\s+نتيجة/), pages = footer.match(/صفحة\s+\d+\s+من\s+\d+/);
          const excerpt = table.replace(/<svg\b[\s\S]*?<\/svg>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s(?:class|style|x-[\w:-]+|:[\w:-]+)="[^"]*"/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').replace(/<tr\b/gi, '\n<tr').replace(/<\/table>/gi, '\n</table>').trim() + '\n' + (range?.[0] || '') + '\n' + (pages?.[0] || '') + '\n';
          // Fixtures update only with a separate, explicit local flag; never at workflow runtime.
          if (process.argv.includes('--write-fixtures')) {
            const dir = path.join(__dirname, 'fixtures'); fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'page-' + state.page + '.html'), excerpt);
          }
        }
      }
    } catch { response = { statusCode: 0 }; }
    state = sourceResponse(state, response);
    console.log(JSON.stringify({ page: state.sourceAttempts.at(-1)?.page, status: response.statusCode, parsed: state.records.length, phase: state.phase, errorCount: state.errors.length, firstError: state.errors[0] }));
    if (state.phase === 'collect') await sleep(state.delaySeconds * 1000);
  }
  state = finalizeCollection(state);
  const report = summary(state);
  const dir = path.resolve('.npm-logs'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'uqu-academic-live-dry-run.json'), JSON.stringify({ verified_at: new Date().toISOString(), ...report }, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, officialRows: report.official_total_rows, parsedPrograms: report.parsed_programs, pages: report.pages, batchSizes: report.batch_sizes, fingerprint: report.dataset_fingerprint, campusRequests: 0, errors: report.errors }, null, 2));
  if (report.status !== 'dry_run') process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
