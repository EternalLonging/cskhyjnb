const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'cet6-data.js'), 'utf8');
const dataText = source.match(/window\.CET6_DATA = (.*);\r?\nwindow\.QUESTION_BANK/s)?.[1];
const bankText = source.match(/window\.QUESTION_BANK = \(window\.QUESTION_BANK \|\| \[\]\)\.concat\((.*)\);/s)?.[1];
assert.ok(dataText && bankText, 'the generated CET-6 bank must be available');
const data = JSON.parse(dataText);
const bank = JSON.parse(bankText);

test('CET-6 papers have unique questions, complete answers, passages, and local resources', () => {
  assert.equal(data.papers.length, 15);
  assert.equal(bank.length, 700);
  for (const paper of data.papers) {
    const questions = bank.filter(q => q.paperId === paper.id);
    assert.equal(questions.length, paper.count, paper.id);
    assert.equal(new Set(questions.map(q => q.number)).size, paper.count, paper.id);
    assert.equal(questions[0].number, paper.audio ? 1 : 26, paper.id);
    assert.ok(fs.existsSync(path.join(root, paper.pdf)), `${paper.id} PDF`);
    if (paper.audio) assert.ok(fs.existsSync(path.join(root, paper.audio)), `${paper.id} audio`);
    assert.ok(questions.every(q => data.materials[q.materialId]), `${paper.id} materials`);
    assert.ok(questions.filter(q => q.number < 26 || q.number > 45)
      .every(q => q.options.length === 4 && /^[A-D]$/.test(q.answer)), `${paper.id} multiple choice`);
    assert.ok(questions.filter(q => q.number >= 26 && q.number <= 45)
      .every(q => /^[A-Z](?:\|.+)?$/.test(q.answer)), `${paper.id} fill and matching keys`);
    for (const group of ['cloze', 'match', 'read1', 'read2']) {
      assert.ok(data.materials[`${paper.id}-${group}`]?.passage.length > 500, `${paper.id} ${group} passage`);
    }
    if (paper.audio) assert.equal(data.materials[`${paper.id}-listen`].audio, paper.audio);
  }
});

test('available listening transcripts map to their question ranges and missing text is identified', () => {
  const transcriptsSource = fs.readFileSync(path.join(root, 'cet6-transcripts.js'), 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(transcriptsSource, context);
  const transcripts = context.window.CET6_TRANSCRIPTS;
  for (const paperId of ['cet6-2024-06-01', 'cet6-2024-06-02']) {
    assert.equal(transcripts[paperId].length, 7);
    for (const segment of transcripts[paperId]) {
      assert.ok(segment.english.length > 100, `${paperId} ${segment.title}`);
      assert.doesNotMatch(segment.english, /[\u4e00-\u9fff]/, `${paperId} ${segment.title} English transcript`);
      assert.match(segment.source, /^https:\/\/m\.kekenet\.com\//);
      assert.ok(bank.some(q => q.paperId === paperId && q.number === segment.start));
      assert.ok(bank.some(q => q.paperId === paperId && q.number === segment.end));
    }
  }
  for (const paperId of [
    'cet6-2024-12-01', 'cet6-2024-12-02', 'cet6-2025-06-01', 'cet6-2025-06-02',
    'cet6-2025-12-01', 'cet6-2025-12-02', 'cet6-2026-06-01',
  ]) {
    const [segment] = transcripts[paperId];
    assert.equal(segment.start, 1, paperId);
    assert.equal(segment.end, 25, paperId);
    assert.ok(segment.english.length > 10000, paperId);
    assert.match(segment.source, /^https:\/\/www\.wordcram\.com\.cn\//);
    assert.ok(bank.some(q => q.paperId === paperId && q.number === 25), paperId);
  }
  assert.equal(transcripts['cet6-2026-06-02'], undefined,
    'do not fabricate a transcript when no public full text is available');
  assert.match(transcriptsSource, /cet6-2026-06-02.*未找到可核实的完整原文/);
  for (const paper of data.papers.filter(paper => paper.audio)) {
    for (let number = 1; number <= 25; number++) {
      const matching = (transcripts[paper.id] || []).filter(segment =>
        number >= segment.start && number <= segment.end);
      if (context.window.CET6_TRANSCRIPTS_UNAVAILABLE[paper.id]) {
        assert.equal(matching.length, 0, `${paper.id} explicitly unavailable`);
      } else {
        assert.equal(matching.length, 1, `${paper.id} question ${number}`);
      }
    }
  }
});

test('listening transcript notices do not appear on reading questions', () => {
  const context = vm.createContext({ window: {}, escapeHtml: text => text });
  vm.runInContext(fs.readFileSync(path.join(root, 'cet6-transcripts.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'cet6.js'), 'utf8'), context);
  assert.match(context.renderCet6Transcript({ paperId: 'cet6-2026-06-02', number: 1 }),
    /未找到可核实的完整原文/);
  assert.equal(context.renderCet6Transcript({ paperId: 'cet6-2026-06-02', number: 26 }), '');
  assert.equal(context.renderCet6Transcript({ paperId: 'cet6-2025-06-01', number: 26 }), '');
  assert.equal(context.renderCet6Transcript(null), '');
});
