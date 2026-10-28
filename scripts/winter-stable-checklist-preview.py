"""A4 four-club paper layout proposal. Sample names only; no registration writes."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import argparse

parser=argparse.ArgumentParser()
parser.add_argument('--font',required=True,help='Japanese TrueType font path')
parser.add_argument('--output',required=True,help='Output PDF path')
args=parser.parse_args()
font=Path(args.font)
pdfmetrics.registerFont(TTFont('JP',str(font)))
out=Path(args.output)
c=canvas.Canvas(str(out),pagesize=A4)
c.setTitle('Winter 入厩チェックリスト 印刷レイアウト見本')
W,H=A4

def text(x,y,s,size=9):
    c.setFillColorRGB(0.05,0.05,0.05);c.setFont('JP',size);c.drawString(x,y,s)
def line(x,y,x2,y2,width=.5):
    c.setStrokeColorRGB(.35,.35,.35);c.setLineWidth(width);c.line(x,y,x2,y2)
def wrap(s,width,size):
    lines=['']
    for ch in s:
        if pdfmetrics.stringWidth(lines[-1]+ch,'JP',size)>width:lines.append(ch)
        else:lines[-1]+=ch
    return lines

text(8*mm,H-7*mm,'2026 Fuji Horse Show Winter  入厩チェックリスト',11)
text(8*mm,H-12*mm,'印刷見本：団体名・馬名・頭数は仮の表示です。A4縦／4団体／日付・確認・署名は手書き。',7.5)
top=H-17*mm; bottom=8*mm; gap=6*mm; card_w=(W-16*mm-gap)/2; card_h=(top-bottom-gap)/2
c.setDash(2,3);line(W/2,8*mm,W/2,top,.45);line(8*mm,(top+bottom)/2,W-8*mm,(top+bottom)/2,.45);c.setDash()

def card(index,club,count):
    col=index%2;row=index//2
    x=8*mm+col*(card_w+gap);y=top-row*(card_h+gap)
    c.setStrokeColorRGB(.2,.2,.2);c.setLineWidth(.7);c.rect(x,y-card_h,card_w,card_h)
    px=x+3*mm;pw=card_w-6*mm
    text(px,y-6*mm,'入厩チェックリスト',10)
    text(x+card_w-24*mm,y-6*mm,f'事前申請 {count}頭',8)
    text(px,y-13*mm,club,9.8)
    text(px,y-18*mm,'申請馬と照合し、相違がなければチェック',7)
    table_top=y-22*mm;header=7*mm;rh=7.5*mm
    widths=[6*mm,29*mm,13*mm,13*mm,pw-61*mm]
    xs=[px]
    for width in widths:xs.append(xs[-1]+width)
    c.setFillColorRGB(.94,.94,.94);c.rect(px,table_top-header,pw,header,fill=1,stroke=0)
    for j,label in enumerate(['確認','馬名','入厩日','退厩日','備考']):text(xs[j]+1*mm,table_top-4.5*mm,label,7.5)
    for i in range(10):line(px,table_top-header-i*rh,px+pw,table_top-header-i*rh)
    line(px,table_top,px+pw,table_top)
    for xx in xs:line(xx,table_top,xx,table_top-header-9*rh)
    for i in range(9):
        cy=table_top-header-i*rh
        if i<count:
            c.rect(px+1.5*mm,cy-5*mm,3*mm,3*mm)
            name=f'見本馬{index+1}-{i+1:02d}号'
            if index==0 and i==0:name='サンプルウィンタースター'
            for k,s in enumerate(wrap(name,widths[1]-2*mm,8)):text(xs[1]+mm,cy-(4+k*3)*mm,s,8)
            for j in [2,3]:text(xs[j]+3.8*mm,cy-5*mm,'／',8)
    ty=table_top-header-9*rh-5.5*mm
    text(px,ty,'入厩確認・獣医師署名',8)
    line(px,ty-7*mm,px+pw,ty-7*mm)
    text(px,ty-12*mm,'退厩時・引取人署名',8)
    line(px,ty-19*mm,px+pw,ty-19*mm)
    text(px,y-card_h+3*mm,'日付：月／日　　相違・変更事項は備考へ記入',6.8)

for i,(club,count) in enumerate([('サンプル乗馬クラブ A',9),('サンプルステーブル B',5),('サンプルホースパーク C',3),('サンプルファーム D',7)]):card(i,club,count)
c.showPage();c.save()
print(out)
