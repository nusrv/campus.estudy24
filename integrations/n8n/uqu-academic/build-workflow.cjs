/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const library = fs.readFileSync(path.join(__dirname, 'collector.cjs'), 'utf8').replace(/\r\n/g, '\n').replace(/^\/\* eslint[^\n]*\n/, '').replace(/\nmodule\.exports = [^]*$/, '');
const nodes = [], connections = {};
function node(name, type, parameters, position, extra = {}) { nodes.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.' + type, typeVersion: ({ code: 2, httpRequest: 4.2, if: 2.2, wait: 1.1, manualTrigger: 1, stickyNote: 1 })[type], position, parameters, ...extra }); }
function code(name, expression, position, before = '') { node(name, 'code', { mode: 'runOnceForAllItems', jsCode: before + library + '\nreturn [{json: ' + expression + '}];' }, position); }
function connect(from, to, branch = 0) { connections[from] ||= { main: [] }; connections[from].main[branch] ||= []; connections[from].main[branch].push({ node: to, type: 'main', index: 0 }); }
function condition(name, phase, position) { node(name, 'if', { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: name, leftValue: '={{ $json.phase }}', rightValue: phase, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }, position); }
node('Manual Dry Run', 'manualTrigger', {}, [0, 0]);
code('Operator Configuration', 'initial(operator)', [240, 0], `// Change only after inspecting a complete dry run. Never put a key here.\nconst operator = {\n  mode: 'dry_run',\n  liveConfirmation: '',\n  approvedDatasetFingerprint: '',\n  maxPages: 10,\n  perPage: 100,\n  requestIntervalSeconds: 2,\n  maxAttempts: 4\n};\n`);
code('Prepare Source Request', 'sourceRequest($input.first().json)', [480, 0]);
node('Official UQU HTML Request', 'httpRequest', {
  method: 'GET', url: '={{ $json.requestUrl }}', sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Accept', value: 'text/html' }, { name: 'User-Agent', value: 'CampusAcademicDirectory/1.0 (+https://github.com/nusrv/campus.estudy24)' }] },
  options: { timeout: 30000, redirect: { redirect: { followRedirects: false } }, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'body' } } },
}, [720, 0], { onError: 'continueRegularOutput' });
code('Parse Official Page', "sourceResponse(JSON.parse(JSON.stringify($('Prepare Source Request').item.json)), $input.first().json)", [960, 0]);
condition('More Source Requests', 'collect', [1200, 0]);
node('Polite Source Delay', 'wait', { resume: 'timeInterval', amount: '={{ $json.delaySeconds }}', unit: 'seconds' }, [1200, -240]);
code('Validate Identity and Create Batches', 'finalizeCollection($input.first().json)', [1440, 100]);
condition('Explicit Live Approval', 'submit', [1680, 100]);
code('Prepare Campus Request', 'campusRequest($input.first().json)', [1920, -100]);
node('Campus Scoped Ingestion', 'httpRequest', {
  method: 'POST', url: 'https://campus.estudy24.com/api/ingest/academic-programs',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({items: $json.pending}) }}',
  options: { timeout: 30000, redirect: { redirect: { followRedirects: false } }, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'body' } } },
}, [2160, -100], { disabled: true, onError: 'continueRegularOutput', notes: 'Disabled by default. Enable only after reviewing a complete dry run and configuring all three live approval fields. Configure a local Header Auth credential: Authorization: Bearer <UQU-scoped key>. Never paste the key into workflow fields.' });
code('Record Outcomes and Retry Decisions', "campusResponse(JSON.parse(JSON.stringify($('Prepare Campus Request').item.json)), $input.first().json)", [2400, -100]);
condition('More Campus Requests', 'submit', [2640, -100]);
node('Campus Backoff and Rate Limit', 'wait', { resume: 'timeInterval', amount: '={{ $json.delaySeconds }}', unit: 'seconds' }, [2400, -340]);
code('Final Report', 'summary($input.first().json)', [2880, 200]);
node('Read Before Running', 'stickyNote', { content: '## UQU academic degrees only — inactive / dry run\nRead README.ar.md before execution. No Campus credential is exported.\nDefault manual execution only fetches public HTML and produces Final Report.\nLive requires mode=live + exact confirmation + reviewed dataset fingerprint + a locally configured UQU-scoped Header Auth credential.\nDo not bypass validation/approval or execute the HTTP node in isolation. No schedule, deletion, or publication calls.\nSelf-hosted Code runners must allow only the crypto built-in module used for the dataset SHA-256.\nKeep n8n access and execution-data retention restricted.', width: 1000, height: 240 }, [0, -400]);
connect('Manual Dry Run', 'Operator Configuration'); connect('Operator Configuration', 'Prepare Source Request');
connect('Prepare Source Request', 'Official UQU HTML Request'); connect('Official UQU HTML Request', 'Parse Official Page');
connect('Parse Official Page', 'More Source Requests'); connect('More Source Requests', 'Polite Source Delay'); connect('Polite Source Delay', 'Prepare Source Request');
connect('More Source Requests', 'Validate Identity and Create Batches', 1); connect('Validate Identity and Create Batches', 'Explicit Live Approval');
connect('Explicit Live Approval', 'Prepare Campus Request'); connect('Explicit Live Approval', 'Final Report', 1);
connect('Prepare Campus Request', 'Campus Scoped Ingestion'); connect('Campus Scoped Ingestion', 'Record Outcomes and Retry Decisions');
connect('Record Outcomes and Retry Decisions', 'More Campus Requests'); connect('More Campus Requests', 'Campus Backoff and Rate Limit'); connect('Campus Backoff and Rate Limit', 'Prepare Campus Request'); connect('More Campus Requests', 'Final Report', 1);
const workflow = { name: 'Campus eStudy24 — UQU academic directory (safe dry run)', versionId: '7bfac454-1de4-4195-955f-a78969ae1fae', active: false, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Riyadh', executionTimeout: 1800, saveManualExecutions: true }, pinData: {}, tags: [] };
const output = JSON.stringify(workflow, null, 2) + '\n';
const target = path.join(__dirname, 'uqu-academic-programs.workflow.json');
if (process.argv.includes('--check')) { if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('Workflow export is stale; run build-workflow.cjs'); }
else fs.writeFileSync(target, output);
