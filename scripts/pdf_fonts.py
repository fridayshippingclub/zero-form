"""Derive a named, per-document TW-Kai subset below the core asset size limit."""
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / 'assets/fonts/tw-kai/TW-Kai.ttf'
SUBSET_FAMILY = 'Zero Form Kai Demo'

def subset_font(destination, text):
    options = subset.Options()
    font = subset.load_font(str(FONT_PATH), options)
    sub = subset.Subsetter(options=options)
    sub.populate(text=''.join(chr(n) for n in range(32,127)) + text)
    sub.subset(font)
    for name in font['name'].names:
        if name.nameID in (1,4,6,16):
            value = SUBSET_FAMILY.replace(' ', '-') if name.nameID == 6 else SUBSET_FAMILY
            name.string = value.encode(name.getEncoding())
    subset.save_font(font, str(destination), options)
