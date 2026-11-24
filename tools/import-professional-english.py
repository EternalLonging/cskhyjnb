"""Import the question stems, options, and answer keys from a review DOCX."""
import json
import re
import argparse
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
QUESTION_RE = re.compile(r"^\s*(\d{1,2})[.．]\s*(.+?)\s*$", re.S)
OPTION_RE = re.compile(r"(?:^|\t|\n)\s*([A-D])[.．]\s*", re.M)
CHAPTER_RE = re.compile(r"^CH\s*(\d+)\s*(.*)$", re.I)


def paragraph_text(element):
    parts = []
    for node in element.iter():
        if node.tag == f"{{{NS['w']}}}t":
            parts.append(node.text or "")
        elif node.tag == f"{{{NS['w']}}}tab":
            parts.append("\t")
        elif node.tag in (f"{{{NS['w']}}}br", f"{{{NS['w']}}}cr"):
            parts.append("\n")
    return re.sub(r" +", " ", "".join(parts)).strip()


def parse_options(paragraphs, start):
    collected = []
    cursor = start
    while cursor < len(paragraphs) and len(collected) < 4:
        text = paragraphs[cursor]
        cursor += 1
        if not text:
            continue
        matches = list(OPTION_RE.finditer(text))
        if not matches:
            break
        for index, match in enumerate(matches):
            label = match.group(1)
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            option = text[match.end():end].strip(" \t\r\n")
            if collected and label != chr(ord(collected[-1][0]) + 1):
                raise ValueError(f"Unexpected option order near {text[:100]!r}")
            collected.append((label, option))
    if [label for label, _ in collected] != list("ABCD") or not all(text for _, text in collected):
        raise ValueError(f"Expected four A-D options at paragraph {start}: {collected!r}")
    return [{"label": label, "text": text} for label, text in collected], cursor


def load_document(source):
    with zipfile.ZipFile(source) as archive:
        body = ET.fromstring(archive.read("word/document.xml")).find("w:body", NS)
    blocks = []
    for element in body:
        kind = element.tag.rsplit("}", 1)[-1]
        if kind == "p":
            blocks.append(("p", paragraph_text(element)))
        elif kind == "tbl":
            rows = []
            for row in element.findall("w:tr", NS):
                rows.append([
                    " ".join(paragraph_text(p) for p in cell.findall("w:p", NS)).strip()
                    for cell in row.findall("w:tc", NS)
                ])
            blocks.append(("table", rows))
    return blocks


def build_bank(source):
    blocks = load_document(source)
    chapter_titles = {}
    for kind, rows in blocks:
        if kind == "table" and rows and rows[0] == ["章节", "复习内容", "题数"]:
            chapter_titles = {row[0]: row[1] for row in rows[1:] if len(row) == 3}
            break
    if len(chapter_titles) != 10:
        raise ValueError("Expected the source document's ten-chapter overview table")
    questions, answer_keys = [], {}
    chapter = ""
    chapter_title = ""
    for index, (kind, value) in enumerate(blocks):
        if kind == "p":
            match = CHAPTER_RE.match(value)
            if match:
                next_chapter = f"CH{int(match.group(1))}"
                if match.group(2).strip() == chapter_titles.get(next_chapter):
                    chapter = next_chapter
                    chapter_title = match.group(2).strip()
                continue
            if value == "期中随堂测试" or value.startswith("期中测试"):
                chapter, chapter_title = "期中", "期中随堂测试"
                continue
            match = QUESTION_RE.match(value)
            if not match:
                continue
            if not chapter:
                raise ValueError(f"Question outside a chapter at block {index}")
            number = int(match.group(1))
            stem = match.group(2).strip()
            # Remove only the source sheet's empty answer marker.
            stem = re.sub(r"\s*[（(]\s*[）)]\s*$", "", stem).strip()
            following = [text for next_kind, text in blocks[index + 1:index + 5]
                         if next_kind == "p"]
            options, _ = parse_options(following, 0)
            questions.append({
                "id": f"professional-english-{chapter.lower()}-{number:02d}",
                "course": "专业外语",
                "topic": f"{chapter} · {chapter_title}" if chapter != "期中" else chapter_title,
                "subtopic": "单选题",
                "source": source.name,
                "source_stem": f"{chapter} · {chapter_title}",
                "number": number,
                "type": "single",
                "text": stem,
                "options": options,
                "lockOptions": True,
            })
        else:
            rows = value
            if len(rows) < 2 or not rows[0] or "平台标准答案" not in " ".join(rows[0]):
                continue
            if not chapter:
                raise ValueError(f"Answer table outside a chapter at block {index}")
            for row in rows[1:]:
                if len(row) < 2:
                    continue
                number = int(re.match(r"\d+", row[0]).group())
                key = re.match(r"\s*([A-D])\b", row[1], re.I)
                if not key:
                    raise ValueError(f"Missing answer letter: {chapter} {number}: {row[1]!r}")
                letter = key.group(1).upper()
                answer_keys[(chapter, number)] = (letter, row[1][key.end():].strip())

    for question in questions:
        chapter = question["source_stem"].split(" · ")[0]
        key = (chapter, question["number"])
        answer = answer_keys.get(key)
        if not answer:
            raise ValueError(f"Missing answer key for {key}")
        answer, answer_word = answer
        if answer not in {option["label"] for option in question["options"]}:
            raise ValueError(f"Answer {answer} is not a valid option for {key}")
        correct_text = next(option["text"] for option in question["options"] if option["label"] == answer)
        if correct_text.casefold() != answer_word.casefold():
            raise ValueError(f"Answer word mismatch for {key}: {correct_text!r} != {answer_word!r}")
        question["answer"] = answer

    if len({question["id"] for question in questions}) != len(questions):
        raise ValueError("Duplicate chapter/question numbers in the source document")
    expected = {"CH1": 19, **{f"CH{i}": 20 for i in range(2, 10)}, "期中": 25}
    actual = {}
    for question in questions:
        chapter = question["source_stem"].split(" · ")[0]
        actual[chapter] = actual.get(chapter, 0) + 1
    if actual != expected:
        raise ValueError(f"Unexpected chapter question counts: {actual!r}")
    return questions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the review DOCX")
    args = parser.parse_args()
    questions = build_bank(args.source)
    output = "// Generated by tools/import-professional-english.py.\n"
    output += "window.QUESTION_BANK = window.QUESTION_BANK || [];\n"
    output += "window.QUESTION_BANK.push(..."
    output += json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    output += ");\n"
    (ROOT / "questions_professional_english.js").write_text(output, encoding="utf-8")
    print(f"Imported {len(questions)} questions across {len(set(q['topic'] for q in questions))} topics.")


if __name__ == "__main__":
    main()
