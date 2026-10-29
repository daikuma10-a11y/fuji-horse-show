"""Approved two-club checklist layout with up to 16 horses and fitted names."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

import argparse

parser = argparse.ArgumentParser(description='A4 landscape, two club cards; sample data only.')
parser.add_argument('--font', required=True, help='Japanese TrueType font path')
parser.add_argument('--output', required=True, help='Output PDF path')
args = parser.parse_args()
out = Path(args.output)
out.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('JP', args.font))
W, H = landscape(A4)
c = canvas.Canvas(str(out), pagesize=(W, H))
c.setTitle('Winter 入厩チェックリスト 印刷見本 - A4横・2団体・各16頭・備考欄')
c.setAuthor('Fuji Horse Show')
c.setFillColorRGB(0, 0, 0)
c.setStrokeColorRGB(0.25, 0.25, 0.25)

def text(x, y, value, size=12, center=False):
    c.setFont('JP', size)
    if center:
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)

def rule(x1, y1, x2, y2, weight=0.55):
    c.setLineWidth(weight)
    c.line(x1, y1, x2, y2)

def fitted_size(value, maxwidth, size):
    natural = pdfmetrics.stringWidth(value, 'JP', size)
    return size * maxwidth / natural * .98 if natural > maxwidth else size

def horse_name(x, upper, value, maxwidth):
    # Preserve every character on one line, matching the administration printout.
    text(x, upper - 7.3*mm, value, fitted_size(value, maxwidth, 11))

def card(index, club, horses):
    assert len(horses) <= 16
    origin = index * W / 2
    left, right = origin + 9*mm, origin + W/2 - 9*mm
    middle = (left + right)/2
    width = right-left
    text(middle, H - 21*mm, club, fitted_size(club, width, 20), center=True)
    text(middle, H - 42*mm, f'{len(horses)}頭', 30, center=True)
    top, row_height = H - 60*mm, 12*mm
    col_width = width/2
    bottom = top - 8*row_height
    rule(middle, top + 6*mm, middle, bottom, 0.65)
    for col in range(2):
        cell_x = left + col*col_width
        notes_x = cell_x + 43*mm
        text(cell_x + 25*mm, top + 2.5*mm, '馬名', 11, center=True)
        text((notes_x + cell_x + col_width)/2, top + 2.5*mm, '備考', 11, center=True)
        c.setDash(1.5, 2)
        rule(notes_x, top + 6*mm, notes_x, bottom, 0.45)
        c.setDash()
    rule(left, top, right, top)
    for row in range(8):
        upper = top - row*row_height
        baseline = upper - row_height
        rule(left, baseline, right, baseline)
        for col in range(2):
            pos = col*8 + row
            cell_x = left + col*col_width
            c.setLineWidth(0.65)
            c.rect(cell_x + 2*mm, upper - 8*mm, 4*mm, 4*mm)
            if pos < len(horses):
                horse_name(cell_x + 9*mm, upper, horses[pos], 32*mm)
    text(left, 35*mm, '退厩時・引取人署名', 11)
    text(middle + 4*mm, 35*mm, '獣医師署名', 11)
    rule(left, 18*mm, middle - 4*mm, 18*mm, 0.65)
    rule(middle + 4*mm, 18*mm, right, 18*mm, 0.65)

horses_a = ['サンプルウィンタースター'] + [f'見本馬1-{i:02d}号' for i in range(2,17)]
horses_b = [f'見本馬2-{i:02d}号' for i in range(1,6)]
card(0, 'サンプル乗馬クラブ A', horses_a)
card(1, 'サンプルステーブル B', horses_b)
c.setDash(3, 3)
rule(W/2, 6*mm, W/2, H - 6*mm, 0.6)
c.setDash()
c.showPage()
c.save()

r = PdfReader(out)
assert len(r.pages) == 1
p = r.pages[0]
assert abs(float(p.mediabox.width) - 297*mm) < 0.1
assert abs(float(p.mediabox.height) - 210*mm) < 0.1
s = p.extract_text()
assert '16頭' in s and '5頭' in s
for prohibited in ('入厩チェックリスト', '事前申請', '入厩日', '退厩日', '日付', '相違'):
    assert prohibited not in s, prohibited
assert s.count('退厩時・引取人署名') == 2
assert s.count('獣医師署名') == 2
assert s.count('備考') == 4
for name in horses_a + horses_b:
    assert s.count(name) == 1, name
print(out)
print('Verified: A4 landscape, 2 clubs, 16 slots per club, remarks beside each horse, 21 sample names.')
