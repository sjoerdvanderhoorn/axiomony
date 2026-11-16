"""Generate the deterministic 60-second ACME concept walkthrough GIF.

This is a storyboard, not a live recording of Axiomony or a security test.
Run with: python scripts/build_acme_walkthrough.py
Requires Pillow (pip install Pillow).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
import textwrap

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / 'docs/assets/acme-walkthrough.gif'
OUT.parent.mkdir(parents=True, exist_ok=True)
W, H = 1100, 620
FPS_STEPS = 24
DURATION_PER_FRAME = 2500  # 24 x 2.5 sec = exactly 60 seconds.

COLORS = {
    'background': '#F5F7FB', 'paper': '#FFFFFF', 'ink': '#232B3E',
    'secondary': '#627086', 'subtle': '#8893A5', 'border': '#DEE3ED',
    'purple': '#5D62A4', 'purple_light': '#EFF0FB', 'blue_light': '#EAF2FE',
    'green': '#317861', 'green_light': '#E9F5EF', 'navy': '#1B263C',
    'gray_light': '#F3F5F9', 'orange': '#B6753A', 'orange_light': '#FFF4E5'
}
fontdir = '/usr/share/fonts/truetype'
interdir = '/usr/share/fonts/opentype/inter'

def font(size: int, weight='regular'):
    variants = {
        'regular': f'{interdir}/Inter-Regular.otf',
        'medium': f'{interdir}/Inter-Medium.otf',
        'semibold': f'{interdir}/Inter-SemiBold.otf',
        'bold': f'{interdir}/Inter-Bold.otf',
    }
    candidate = variants[weight]
    if not Path(candidate).exists():
        candidate = f'{fontdir}/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(candidate, size)

F12, F13, F14, F16, F18, F20, F22, F26, F30 = [font(n) for n in (12,13,14,16,18,20,22,26,30)]
F14B, F16B, F18B, F22B = [font(n, 'semibold') for n in (14,16,18,22)]


def rect(draw, xy, fill, radius=0, outline=None, width=1):
    draw.rounded_rectangle(tuple(map(int,xy)), radius=radius, fill=fill, outline=outline, width=width)


def txt(draw, xy, value, fill=None, f=F16, anchor=None):
    draw.text(xy, value, fill=fill or COLORS['ink'], font=f, anchor=anchor)


def fit_lines(draw, text, f, limit):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        tentative = (cur+' '+w).strip()
        if draw.textbbox((0,0), tentative, font=f)[2] > limit and cur:
            lines.append(cur)
            cur = w
        else:
            cur = tentative
    if cur:
        lines.append(cur)
    return lines


def badge(draw, xy, text, background, color, width=None):
    x,y=xy
    label_width = draw.textbbox((0,0),text,font=F13)[2]
    width = width or label_width+20
    rect(draw, (x,y,x+width,y+26), background, 8)
    txt(draw, (x+10,y+5), text, color, F13)
    return width


def circle_cross(draw, x, y, r, color, width=2):
    # Shared Axiomony mark: four separated arcs and a cross.
    for start,end in ((-83,-7),(7,83),(97,173),(187,263)):
        draw.arc((x-r,y-r,x+r,y+r),start,end,fill=color,width=width)
    draw.line((x-r*.81,y,x+r*.81,y),fill=color,width=width)
    draw.line((x,y-r*.81,x,y+r*.81),fill=color,width=width)

@dataclass(frozen=True)
class Chat:
    start: int
    who: str
    message: str

CHATS = [
    Chat(0, 'ACME owner', 'Set up a shared accounting database for ACME. We buy, sell and invoice.'),
    Chat(1, 'Axiomony', 'I propose customers, suppliers, products, orders, invoices and payments.'),
    Chat(2, 'ACME owner', 'Show the schema and relationships first.'),
    Chat(3, 'Axiomony', 'Ready for review. Nothing changes until you approve the plan.'),
    Chat(4, 'ACME owner', 'Approve this database plan.'),
    Chat(5, 'Axiomony', 'The shared schema is created with explicit relationships.'),
    Chat(6, 'ACME owner', 'Invoices of EUR 500 or more must be approved.'),
    Chat(7, 'Axiomony', 'Approval rule added to the database. Every client follows it.'),
    Chat(8, 'ACME owner', 'Sales handles orders; Finance approves payments.'),
    Chat(9, 'Axiomony', 'Permissions are enforced at the data source.'),
    Chat(10, 'Purchasing', 'Make me a phone-friendly invoice entry form.'),
    Chat(11, 'AI assistant', 'I will use the tables and fields you are allowed to access.'),
    Chat(12, 'Purchasing', 'Great. I can register supplier invoices in seconds.'),
    Chat(14, 'Sales', 'I want a pipeline with quotes, customers and orders.'),
    Chat(15, 'AI assistant', 'Building a sales view from your permitted data.'),
    Chat(17, 'Sales', 'My workspace is different, but the rules are the same.'),
    Chat(18, 'Finance', 'Give me a payment reconciliation workspace.'),
    Chat(19, 'AI assistant', 'Using approved bank access and database permissions.'),
    Chat(21, 'Finance', 'Perfect. I can check paid and pending invoices.'),
    Chat(22, 'ACME owner', 'One shared source of truth. Each team has its own tools.'),
    Chat(23, 'Axiomony', 'Shared rules. Individual freedom.'),
]

TABLES = ['customers','suppliers','products','purchase_orders','sales_orders','invoices','payments']


def chat_panel(draw, i):
    rect(draw, (22,87,650,564), COLORS['paper'], 15, COLORS['border'])
    txt(draw,(45,104),'Conversation',COLORS['ink'],F18B)
    badge(draw,(506,101),'ACME workspace',COLORS['gray_light'],COLORS['secondary'])
    draw.line((23,147,649,147),fill=COLORS['border'],width=1)
    msgs=[c for c in CHATS if c.start<=i]
    # Height-calculated chat bubbles, newest anchored near bottom.
    chat_items=[]
    for msg in msgs:
        user=msg.who not in ('Axiomony','AI assistant')
        lines=fit_lines(draw,msg.message,F16,480)
        bubble_h = 52+max(0,len(lines)-1)*23
        chat_items.append((msg,user,lines,bubble_h))
    shown=[]
    budget=397
    for item in reversed(chat_items):
        if sum(v[3]+13 for v in shown) + item[3]+13 > budget:
            break
        shown.append(item)
    shown.reverse()
    y=157
    for msg,user,lines,h in shown:
        x=105 if user else 43
        r=625 if user else 558
        if user:
            bg=COLORS['purple_light']; dot=COLORS['purple']
        else:
            bg=COLORS['gray_light']; dot=COLORS['green']
        rect(draw,(x,y,r,y+h),bg,10)
        draw.ellipse((x+11,y+10,x+18,y+17),fill=dot)
        txt(draw,(x+25,y+7),msg.who, COLORS['secondary'],F13)
        for n,line in enumerate(lines):
            txt(draw,(x+12,y+25+n*22),line,COLORS['ink'],F16)
        y+=h+13


def database_panel(draw,i):
    rect(draw,(668,87,1077,379),COLORS['paper'],15,COLORS['border'])
    txt(draw,(691,105),'Shared database',COLORS['ink'],F18B)
    if i<3: badge(draw,(951,102),'Planning',COLORS['orange_light'],COLORS['orange'])
    elif i<5: badge(draw,(943,102),'Reviewed',COLORS['blue_light'],COLORS['purple'])
    else: badge(draw,(963,102),'Active',COLORS['green_light'],COLORS['green'])
    draw.line((669,147,1076,147),fill=COLORS['border'])
    if i<2:
        txt(draw,(698,194),'Data model',COLORS['secondary'],F14B)
        txt(draw,(698,228),'Tables and relationships',COLORS['subtle'],F16)
        txt(draw,(698,254),'will appear here.',COLORS['subtle'],F16)
    else:
        txt(draw,(691,161),'SCHEMA',COLORS['subtle'],F12)
        count= min(7, 2+max(0,i-3)*2) if i < 6 else 7
        for j,table in enumerate(TABLES[:count]):
            col=j%2; row=j//2
            x=690+col*192; y=187+row*32
            rect(draw,(x,y,x+184,y+27),COLORS['gray_light'],6,COLORS['border'])
            draw.ellipse((x+9,y+9,x+17,y+17),fill=COLORS['purple'] if j<3 else COLORS['green'])
            txt(draw,(x+24,y+6),table,COLORS['ink'],F13)
    if i>=6:
        draw.line((692,322,1054,322),fill=COLORS['border'],width=1)
        if i<8: label='RULES   Approval required at EUR 500+'
        elif i<10: label='RULES   Role-aware access for Sales & Finance'
        else: label='RULES   Access + approvals enforced by DB'
        txt(draw,(692,335),label,COLORS['green'],F13)
    elif i>=3:
        draw.line((692,345,1054,345),fill=COLORS['border'])
        txt(draw,(691,352),'Review schema before applying changes',COLORS['secondary'],F12)


def mockup(draw,x,y,kind):
    if kind=='purchasing':
        rect(draw,(x+6,y,x+62,y+105),'#F3F6FB',9,COLORS['border'])
        rect(draw,(x+19,y+8,x+49,y+11),COLORS['border'],2)
        for j, label in enumerate(('Vendor','Amount','Invoice')):
            txt(draw,(x+12,y+25+j*20),label,COLORS['secondary'],F12)
            draw.line((x+12,y+40+j*20,x+55,y+40+j*20),fill='#AAB4C7')
        rect(draw,(x+13,y+87,x+55,y+100),COLORS['purple'],4)
    elif kind=='sales':
        for j,height in enumerate((47,68,87)):
            rx=x+5+j*24
            rect(draw,(rx,y+100-height,rx+17,y+100),('#BAC3E9','#7C8BD0','#5363B2')[j],3)
        draw.line((x+5,y+104,x+75,y+104),fill=COLORS['border'],width=2)
    else:
        for j,width in enumerate((64,47,61,53)):
            draw.ellipse((x+5,y+11+j*24,x+13,y+19+j*24),fill=COLORS['green'])
            draw.line((x+23,y+15+j*24,x+23+width,y+15+j*24),fill='#9DB0C7',width=5)


def app_card(draw,x,name,desc,kind,visible,active):
    y=414; w=123; h=135
    border=COLORS['purple'] if active else COLORS['border']
    rect(draw,(x,y,x+w,y+h),COLORS['paper'] if visible else COLORS['gray_light'],12,border,width=2 if active else 1)
    txt(draw,(x+12,y+12),name,COLORS['ink'] if visible else '#A2A9B6',F13)
    if visible:
        mockup(draw,x+23,y+28,kind)
    else:
        txt(draw,(x+20,y+69),'—',COLORS['border'],F26)


def apps_panel(draw,i):
    txt(draw,(668,393),'User-created experiences',COLORS['secondary'],F14B)
    app_card(draw,668,'Purchasing','Capture','purchasing',i>=12,10<=i<=13)
    app_card(draw,808,'Sales','Orders','sales',i>=16,14<=i<=17)
    app_card(draw,948,'Finance','Matching','finance',i>=20,18<=i<=21)


def build_frame(i):
    im=Image.new('RGB',(W,H),COLORS['background'])
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,69),fill=COLORS['navy'])
    circle_cross(d,49,35,16,'#C5D0FE',width=2)
    txt(d,(78,22),'AXIOMONY', '#EFF0FF', F18B)
    txt(d,(215,25),'/  ACME ACCOUNTING', '#AEB9CD', F14)
    txt(d,(878,24),'Concept walkthrough', '#CBD3E2',F14)
    txt(d,(1047,26),f'{int(i*2.5)//60}:{int(i*2.5)%60:02d}', '#CBD3E2', F13)
    d.rectangle((0,68,round(W*(i+1)/FPS_STEPS),70),fill='#8B92DD')
    chat_panel(d,i)
    database_panel(d,i)
    apps_panel(d,i)
    txt(d,(23,587),'Illustrative ACME scenario — not a live application recording',COLORS['subtle'],F13)
    txt(d,(822,587),'Data · Rules · Individual UX',COLORS['secondary'],F13)
    return im

if __name__ == '__main__':
    imgs=[build_frame(i) for i in range(FPS_STEPS)]
    for ix in (0,6,12,16,20,23):
        imgs[ix].save(BASE/f'preview-{ix:02}.png')
    imgs[0].save(OUT, save_all=True, append_images=imgs[1:], duration=DURATION_PER_FRAME,
                 loop=0, optimize=True, disposal=2)
    print(f'{OUT}: {OUT.stat().st_size:,} bytes, {len(imgs)} frames, {len(imgs)*DURATION_PER_FRAME/1000:.0f} seconds')
