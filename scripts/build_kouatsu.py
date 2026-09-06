#!/usr/bin/env python3
"""依存パッケージなしで配布HTMLを再生成する。"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'kouatsu'

def build():
    template = (SOURCE / 'template.html').read_text(encoding='utf-8')
    css = (SOURCE / 'style.css').read_text(encoding='utf-8')
    snapshots = json.loads((SOURCE / 'snapshots.json').read_text(encoding='utf-8'))
    snapshot_js = 'const SNAPSHOTS = ' + json.dumps(snapshots, ensure_ascii=False, separators=(',', ':')) + ';\n'
    scripts = ['"use strict";\n', snapshot_js]
    for name in ['classification.js', 'data.js', 'engine.js', 'laws.js', 'app.js']:
        scripts.append('\n/* ===== ' + name + ' ===== */\n' + (SOURCE / name).read_text(encoding='utf-8'))
    js = '\n'.join(scripts).replace('</script', '<\\/script').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    output = template.replace('/* BUILD:CSS */', css).replace('/* BUILD:JS */', js)
    target = ROOT / 'tools' / 'kouatsu-gas-law-viewer.html'
    target.write_text(output, encoding='utf-8')
    print(f'{target.relative_to(ROOT)}: {target.stat().st_size:,} bytes')

if __name__ == '__main__':
    build()
