"""
Recherche de photos de plats sur Wikimedia Commons (licences libres).

  request.json  {recipeId: [requêtes]}  → sheets/<id>.jpg (planche de candidates numérotées)
                                          + candidates.json (fichier, auteur, licence)
  chosen.json   {recipeId: "File.jpg"}  → cuisine-app/public/photos/<id>.webp + chosen-meta.json

Lancé par .github/workflows/photos.yml (le conteneur de développement n'a pas accès à Wikimedia).
"""
import json, os, re, sys, time, html, io, urllib.parse, urllib.request
from PIL import Image, ImageDraw

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'BienNourrisPhotos/1.0 (https://github.com/lorenzobruno01/brunocreation.github.io)'
HERE = os.path.dirname(os.path.abspath(__file__))
OK_LICENSE = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? \d)', re.I)
PER_RECIPE = 6


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # 429 / réseau : on attend un peu
            print('  retry', i, e, file=sys.stderr)
            time.sleep(2 + i * 4)
    return None


def api(params):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    raw = get(API + '?' + urllib.parse.urlencode(params))
    return json.loads(raw) if raw else {}


def clean(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def search(q, width):
    d = api({'action': 'query', 'generator': 'search', 'gsrsearch': f'{q} filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 5,
             'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': width})
    pages = sorted(d.get('query', {}).get('pages', []), key=lambda p: p.get('index', 99))
    out = []
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]
        if ii.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
            continue
        m = ii.get('extmetadata', {})
        lic = clean(m.get('LicenseShortName', {}).get('value'))
        if not OK_LICENSE.match(lic):
            continue
        out.append({'file': p['title'].removeprefix('File:'), 'author': clean(m.get('Artist', {}).get('value'))[:80] or 'inconnu',
                    'license': lic, 'source': ii.get('descriptionurl'), 'thumb': ii.get('thumburl'), 'w': ii.get('width'), 'h': ii.get('height')})
    return out


def sheet(rid, cands):
    tiles = []
    for c in cands:
        raw = get(c['thumb'])
        time.sleep(0.3)
        if not raw:
            continue
        try:
            im = Image.open(io.BytesIO(raw)).convert('RGB')
        except Exception:
            continue
        im.thumbnail((300, 300))
        tiles.append((c, im))
    if not tiles:
        return []
    W = 310 * len(tiles)
    out = Image.new('RGB', (W, 340), 'white')
    d = ImageDraw.Draw(out)
    d.text((6, 4), rid, fill='black')
    for i, (c, im) in enumerate(tiles):
        out.paste(im, (i * 310 + 5, 30))
        d.rectangle((i * 310 + 5, 30, i * 310 + 30, 50), fill='black')
        d.text((i * 310 + 12, 34), str(i + 1), fill='white')
    os.makedirs(os.path.join(HERE, 'sheets'), exist_ok=True)
    out.save(os.path.join(HERE, 'sheets', f'{rid}.jpg'), quality=70)
    return [c for c, _ in tiles]


def do_request():
    req = json.load(open(os.path.join(HERE, 'request.json')))
    path = os.path.join(HERE, 'candidates.json')
    res = json.load(open(path)) if os.path.exists(path) else {}
    for n, (rid, queries) in enumerate(req.items()):
        if rid in res:
            continue
        seen, cands = set(), []
        for q in queries:
            for c in search(q, 330):
                if c['file'] not in seen:
                    seen.add(c['file'])
                    cands.append(c)
            time.sleep(0.3)
        cands = sheet(rid, cands[:PER_RECIPE])
        res[rid] = [{k: v for k, v in c.items() if k != 'thumb'} for c in cands]
        print(n, rid, len(cands))
        json.dump(res, open(path, 'w'), ensure_ascii=False, indent=1)


def do_chosen():
    chosen = json.load(open(os.path.join(HERE, 'chosen.json')))
    out_dir = os.path.join(HERE, '..', 'cuisine-app', 'public', 'photos')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(HERE, 'chosen-meta.json')
    meta = json.load(open(path)) if os.path.exists(path) else {}
    for rid, f in chosen.items():
        target = os.path.join(out_dir, f'{rid}.webp')
        if rid in meta and os.path.exists(target):
            continue
        d = api({'action': 'query', 'titles': f'File:{f}', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 960})
        p = (d.get('query', {}).get('pages') or [{}])[0]
        ii = (p.get('imageinfo') or [{}])[0]
        raw = ii.get('thumburl') and get(ii['thumburl'])
        if not raw:
            print('échec', rid, f)
            continue
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        im.thumbnail((800, 800))
        im.save(target, 'WEBP', quality=72)
        m = ii.get('extmetadata', {})
        meta[rid] = {'file': f, 'author': clean(m.get('Artist', {}).get('value'))[:80] or 'inconnu',
                     'license': clean(m.get('LicenseShortName', {}).get('value')), 'source': ii.get('descriptionurl')}
        print(rid, f, os.path.getsize(target) // 1024, 'ko')
        json.dump(meta, open(path, 'w'), ensure_ascii=False, indent=1)
        time.sleep(0.5)


if __name__ == '__main__':
    if os.path.exists(os.path.join(HERE, 'request.json')):
        do_request()
    if os.path.exists(os.path.join(HERE, 'chosen.json')):
        do_chosen()
