"""Fetch and rebuild publicly available 2024–2026 CET-6 listening transcripts."""
import json
import re
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS = {
    '2024-06-01': [
        ('long conversation 1', 1, 4, 'https://m.kekenet.com/cet6/202407/692815.shtml'),
        ('long conversation 2', 5, 8, 'https://m.kekenet.com/cet6/202407/692816.shtml'),
        ('passage 1', 9, 11, 'https://m.kekenet.com/cet6/202407/692817.shtml'),
        ('passage 2', 12, 15, 'https://m.kekenet.com/cet6/202407/692819.shtml'),
        ('recording 1', 16, 18, 'https://m.kekenet.com/cet6/202408/692820.shtml'),
        ('recording 2', 19, 21, 'https://m.kekenet.com/cet6/202408/692821.shtml'),
        ('recording 3', 22, 25, 'https://m.kekenet.com/cet6/202408/692822.shtml'),
    ],
    '2024-06-02': [
        ('long conversation 1', 1, 4, 'https://m.kekenet.com/cet6/202408/692823.shtml'),
        ('long conversation 2', 5, 8, 'https://m.kekenet.com/cet6/202408/692824.shtml'),
        ('passage 1', 9, 11, 'https://m.kekenet.com/cet6/202408/692825.shtml'),
        ('passage 2', 12, 15, 'https://m.kekenet.com/cet6/202408/692826.shtml'),
        ('recording 1', 16, 18, 'https://m.kekenet.com/cet6/202408/692827.shtml'),
        ('recording 2', 19, 21, 'https://m.kekenet.com/cet6/202408/692828.shtml'),
        ('recording 3', 22, 25, 'https://m.kekenet.com/cet6/202408/692829.shtml'),
    ],
}
FULL_PAPERS = {
    '2024-12-1': 'https://www.wordcram.com.cn/tests/cet6/listening/2024-12-1',
    '2024-12-2': 'https://www.wordcram.com.cn/tests/cet6/listening/2024-12-2',
    '2025-06-1': 'https://www.wordcram.com.cn/tests/cet6/listening/2025-06-1',
    '2025-06-2': 'https://www.wordcram.com.cn/tests/cet6/listening/2025-06-2',
    '2025-12-1': 'https://www.wordcram.com.cn/tests/cet6/listening/2025-12-1',
    '2025-12-2': 'https://www.wordcram.com.cn/tests/cet6/listening/2025-12-2',
    '2026-06-1': 'https://www.wordcram.com.cn/tests/cet6/listening/2026-06-1',
}


class TranscriptParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.in_paragraph = False
        self.hidden = 0
        self.current = []
        self.paragraphs = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div' and 'f-y' in attrs.get('class', '').split():
            self.in_body = True
        elif self.in_body and tag == 'p':
            self.in_paragraph = True
            self.current = []
        elif self.in_paragraph and tag == 'span' and 'display:none' in attrs.get('style', '').replace(' ', ''):
            self.hidden += 1
        elif self.in_paragraph and tag == 'br':
            self.current.append(' ')

    def handle_endtag(self, tag):
        if tag == 'span' and self.hidden:
            self.hidden -= 1
        elif tag == 'p' and self.in_paragraph:
            text = re.sub(r'\s+', ' ', ''.join(self.current)).strip()
            if (text and not re.search(r'[\u4e00-\u9fff]', text)
                    and not re.match(r'Question\s+\d+\b', text, re.I)):
                self.paragraphs.append(text)
            self.in_paragraph = False
            self.current = []
        elif tag == 'div' and self.in_body:
            self.in_body = False

    def handle_data(self, data):
        if self.in_paragraph and not self.hidden:
            self.current.append(data)


class FullPaperParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.transcript_depth = 0
        self.in_english = False
        self.current = []
        self.sentences = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        if tag == 'div' and self.transcript_depth:
            self.transcript_depth += 1
        elif tag == 'div' and attrs.get('id') == 'transcript':
            self.transcript_depth = 1
        elif tag == 'span' and self.transcript_depth and 'transcript-english' in classes:
            self.in_english = True
            self.current = []

    def handle_endtag(self, tag):
        if tag == 'span' and self.in_english:
            sentence = re.sub(r'\s+', ' ', ''.join(self.current)).strip()
            if sentence:
                self.sentences.append(sentence)
            self.current = []
            self.in_english = False
        elif tag == 'div' and self.transcript_depth:
            self.transcript_depth -= 1

    def handle_data(self, data):
        if self.in_english:
            self.current.append(data)


def main():
    output = {}
    for paper_id, segments in PAPERS.items():
        output[f'cet6-{paper_id}'] = []
        for title, start, end, url in segments:
            request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            raw = urlopen(request, timeout=30).read()
            try:
                html = raw.decode('utf-8')
            except UnicodeDecodeError:
                html = raw.decode('gb18030')
            parser = TranscriptParser()
            parser.feed(html)
            english = '\n\n'.join(parser.paragraphs)
            if len(english) < 100:
                raise RuntimeError(f'Transcript not found at {url}')
            output[f'cet6-{paper_id}'].append({
                'title': title.title(), 'start': start, 'end': end,
                'english': english, 'source': url,
            })
    for source_id, url in FULL_PAPERS.items():
        request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        raw = urlopen(request, timeout=30).read()
        try:
            html = raw.decode('utf-8')
        except UnicodeDecodeError:
            html = raw.decode('gb18030')
        parser = FullPaperParser()
        parser.feed(html)
        english = ' '.join(parser.sentences)
        if len(english) < 10000:
            raise RuntimeError(f'Full transcript not found at {url}')
        paper_id = '-'.join(source_id.split('-')[:-1] + [source_id.split('-')[-1].zfill(2)])
        output[f'cet6-{paper_id}'] = [{
            'title': 'Full paper', 'start': 1, 'end': 25,
            'english': english, 'source': url,
        }]
    text = '// Generated by tools/import-cet6-transcripts.py.\nwindow.CET6_TRANSCRIPTS = '
    text += json.dumps(output, ensure_ascii=False, separators=(',', ':')) + ';\n'
    text += 'window.CET6_TRANSCRIPTS_UNAVAILABLE = {"cet6-2026-06-02":"本套目前只有音频，未找到可核实的完整原文。"};\n'
    (ROOT / 'cet6-transcripts.js').write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
