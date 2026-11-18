"""Rebuild the CET-6 bank from the previously downloaded PDFs (PyMuPDF).

Usage: python tools/import-cet6.py <download-directory>
Answer keys were checked against the public reference-answer panels at source URLs.
Document content is treated only as question data.
"""
import json
import re
import shutil
import sys
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[1]
KEYS = {
    '2026-06/01': 'BCADACBAADCDBDAACBBCDDBACJIDCFKBGAEDIFKBHLEMJABCDACBADD',
    '2026-06/02': 'AABDDCBCACDDACABACBBDCBDCDOANEFJIBHFJGMDLCHKBCABCDCBDBA',
    '2026-06/03': 'BANDEMOICJEAGCPIBNDOBCDCDAADDA',
    '2025-12/01': 'ADCABBDCDACABBDBADCBDCACDHJGCEFDKLACHDLAFMJOGDADBBCACDB',
    '2025-12/02': 'BACDABDCBCACABDCBDDACCADBIBMCKADFJOFKJEMIOCNHABCBCDBDAC',
    '2025-12/03': 'NGFJHMECDBQIAJRLFKBNBBACCDCBAD',
    '2025-06/01': 'CBDAADCDCBACCBBDABADCDADBJBLFADCEGOGCIDALFHBKCABBCDADCB',
    '2025-06/02': 'DBADBCABDCBACADCADADBCDBCBEFAIDCGLNCHBIMEOLGNCAADBACBDB',
    '2025-06/03': 'KBIAJCDFOEEKHAIMDLCJACDABBBCDB',
    '2024-12/01': 'DDBCAABCDBDCBAACBDADBCCDAOBAJLDEKNMFCGJHODIEKBBACDDCACB',
    '2024-12/02': 'ACABDCDBABBDCCADCBACBADDALAFGNHDOMIEKGBHMFNDJABDADACDBC',
    '2024-12/03': 'JHOAILGCEDGCIDMJEHALBCAADDBCCD',
    '2024-06/01': 'ABDADCDAADBBCDCDACCBCBBADCHMFNOEAGBDHNFBKEICLABBCDADBDC',
    '2024-06/02': 'BACCABADABBDCCDACBABDDADCAIBDCOMLENCHBKIDNJEOBDADCDCABA',
    '2024-06/03': 'IOHEGNAFJDDIAKHFJLGKBCAADCDBDA',
}

def tidy(s):
    return re.sub(r'\s+', ' ', s).strip()

def question_blocks(s):
    matches = list(re.finditer(r'(?m)^\s*(\d{1,2})\s*[.．]\s*', s))
    return {int(m[1]): s[m.end():matches[i+1].start() if i+1<len(matches) else len(s)].strip()
            for i, m in enumerate(matches)}

def trim_tail(s):
    return re.split(r'(?im)^\s*(?:Questions\s+\d+\s+to|Section\s+[ABC]|Part\s+I|Passage\s+(?:One|Two))', s)[0]

def choices(s):
    markers = list(re.finditer(r'(?m)(?:^|\n)\s*([ABCD])(?:\s*[.)）]\s*|\s{2,})', s))
    # First option follows the question number without a new line.
    if re.match(r'^A\s*[.)）]', s):
        pass
    assert [m[1] for m in markers] == list('ABCD'), ('options', s[:160])
    stem = tidy(s[:markers[0].start()])
    opts = [tidy(s[m.end():markers[i+1].start() if i+1<len(markers) else len(s)]) for i,m in enumerate(markers)]
    assert all(opts)
    return stem, [{'label': l, 'text': t} for l,t in zip('ABCD', opts)]

def main(download):
    manifest = json.loads((download / '文件来源与校验.json').read_text(encoding='utf-8'))
    bank, materials, papers = [], {}, []
    for item in manifest:
        if not item['file'].endswith('.pdf'):
            continue
        period, num = item['source'].split('/')[-2:]
        key = f'{period}/{num}'
        paper_id = f'cet6-{period}-{num}'
        title = f'{period[:4]}年{int(period[5:])}月 · 第{int(num)}套'
        dest = ROOT / 'assets' / 'cet6' / period
        dest.mkdir(parents=True, exist_ok=True)
        source_pdf = download / item['file']
        pdf_path = f'assets/cet6/{period}/{num}.pdf'
        shutil.copy2(source_pdf, ROOT / pdf_path)
        audio_path = ''
        if num != '03':
            audio_path = f'assets/cet6/{period}/{num}.mp3'
            shutil.copy2(download / period / f'{period}_听力第{int(num)}套.mp3', ROOT / audio_path)
        with fitz.open(source_pdf) as doc:
            pages = []
            for page in doc:
                lines = page.get_text().splitlines()
                lines = [l for l in lines if not re.match(r'^\s*(?:\d{1,2}|https://zhenti\.burningvocabulary\.cn)\s*$', l)]
                pages.append('\n'.join(lines))
            text = '\n'.join(pages)
        reading = re.split(r'Reading\s+Comprehension', text, maxsplit=1)[1]
        section_a, rest = re.split(r'(?m)^Section\s+B\s*$', reading, maxsplit=1)
        section_b, section_c = re.split(r'(?m)^Section\s+C\s*$', rest, maxsplit=1)
        section_c = re.split(r'Part\s+IV', section_c, maxsplit=1)[0]
        # End of standard directions starts immediately after "more than once".
        cloze = re.split(r'more\s+than\s+once\s*[.。]', section_a, maxsplit=1)[1].strip()
        word_matches = list(re.finditer(r'(?m)^\s*([A-O])\s*[.)）]\s*', cloze))
        assert [m[1] for m in word_matches] == list('ABCDEFGHIJKLMNO'), key
        words = [{'label':m[1], 'text':tidy(cloze[m.end():word_matches[i+1].start() if i+1<len(word_matches) else len(cloze)])}
                 for i,m in enumerate(word_matches)]
        cloze_passage = tidy(cloze[:word_matches[0].start()])
        # Blank numbers are spaced as separate tokens in extracted source PDFs.
        cloze_passage = re.sub(r'\b(2[6-9]|3[0-5])\b', r'【\1】', cloze_passage)
        match_start = re.search(r'(?m)^\s*A\s*[.)）]\s*', section_b)
        q36 = re.search(r'(?m)^\s*36\s*[.．]', section_b)
        assert match_start and q36, key
        match_passage = section_b[match_start.start():q36.start()].strip()
        paragraphs = re.split(r'(?m)^\s*(?=[A-Z]\s*[.)）]\s*)', match_passage)
        match_passage = '\n\n'.join(tidy(p) for p in paragraphs if p.strip())
        match_labels = re.findall(r'(?m)^([A-Z])[.)）]', match_passage)
        passages = re.split(r'Passage\s+(?:One|Two)', section_c)[1:]
        assert len(passages) == 2, key
        contexts = {
            'cloze': {'title': '选词填空 · 26–35', 'passage': cloze_passage, 'choices': words},
            'match': {'title': '段落匹配 · 36–45', 'passage': match_passage,
                      'choices': [{'label': l, 'text': f'段落 {l}'} for l in match_labels]},
        }
        for index, (start, end) in enumerate([(46,50),(51,55)]):
            part = passages[index]
            before = re.search(rf'(?m)^\s*{start}\s*[.．]', part)
            assert before, key
            passage = re.split(r'following\s+passage\s*[.。]',part[:before.start()],maxsplit=1)[1]
            contexts[f'read{index+1}'] = {'title': f'仔细阅读 · {start}–{end}', 'passage': tidy(passage)}
        if audio_path:
            contexts['listen'] = {'title':'听力理解 · 1–25', 'audio':audio_path,
                                  'passage':'请先播放听力，再根据录音选择答案。题干问题在录音中朗读；切换题号不会重新播放。'}
        for group, material in contexts.items():
            materials[f'{paper_id}-{group}'] = {**material, 'paperId':paper_id, 'paperTitle':title,
                                                'pdf':pdf_path, 'source':item['source']}
        blocks = question_blocks(section_b[q36.start():])
        for part in passages:
            blocks.update(question_blocks(part))
        if audio_path:
            listening = re.split(r'Part\s+III', re.split(r'Listening\s+Comprehension',text,maxsplit=1)[1], maxsplit=1)[0]
            blocks.update(question_blocks(listening))
        offset = 1 if audio_path else 26
        answers = {n: l for n,l in enumerate(KEYS[key],offset)}
        assert len(answers) == (55 if audio_path else 30), key
        for n, answer in answers.items():
            if n < 26:
                group, subtopic = 'listen','听力理解'
                stem, opts = choices(trim_tail(blocks[n]))
                stem = stem or f'第 {n} 题：请根据录音选择答案。'
                assert answer in 'ABCD'
            elif n <= 35:
                group, subtopic, opts = 'cloze','选词填空',[]
                stem = f'第 {n} 空：从左侧词库选择一个单词，填写字母或单词。'
                word = next(w['text'] for w in words if w['label'] == answer)
                answer = f'{answer}|{word}'
            elif n <= 45:
                group, subtopic, opts = 'match','段落匹配',[]
                stem = tidy(trim_tail(blocks[n]))
                assert answer in match_labels, (key,n,answer,match_labels)
            else:
                group, subtopic = ('read1' if n<=50 else 'read2'),'仔细阅读'
                stem,opts = choices(trim_tail(blocks[n]))
                assert stem and answer in 'ABCD'
            bank.append({'id':f'{paper_id}-q{n}', 'paperId':paper_id,'materialId':f'{paper_id}-{group}',
                         'course':'英语六级','topic':title,'subtopic':subtopic,'source':item['source'],
                         'source_stem':title,'number':n,'text':stem,'type':'single' if opts else 'fill',
                         'options':opts,'answer':answer,'lockOptions':True})
        papers.append({'id':paper_id,'title':title,'period':period,'set':int(num),'pdf':pdf_path,
                       'audio':audio_path,'source':item['source'],'count':len(answers)})
        print(key,len(answers))
    payload={'papers':papers,'materials':materials}
    (ROOT/'cet6-data.js').write_text('// Generated by tools/import-cet6.py; public answer keys checked 2026-11-18.\n'
        +'window.CET6_DATA = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n'
        +'window.QUESTION_BANK = (window.QUESTION_BANK || []).concat('
        +json.dumps(bank,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
    print('Imported',len(bank),'questions;',len(materials),'shared materials')

if __name__ == '__main__':
    main(Path(sys.argv[1]))
