"""
Recherche de photos de plats sous licence libre (Wikimedia Commons + Openverse).

  request.json  {recipeId: [requêtes]}  → sheets/<id>.jpg (planche de candidates numérotées 1..N)
                                          + candidates/<lot>.json (source, auteur, licence)
  chosen.json   {recipeId: "Fichier.jpg" | {"c": n}}
                → cuisine-app/public/photos/<id>.webp + chosen-meta.json

Lancé par .github/workflows/photos.yml, en plusieurs lots parallèles (SHARD / NSHARDS) :
le conteneur de développement n'a pas accès à ces sites.
"""
import glob, hashlib, json, os, re, sys, time, html, io, urllib.parse, urllib.request
from PIL import Image, ImageDraw

API = 'https://commons.wikimedia.org/w/api.php'
OV = 'https://api.openverse.org/v1/images/'
UA = 'BienNourrisPhotos/1.1 (https://github.com/lorenzobruno01/brunocreation.github.io)'
HERE = os.path.dirname(os.path.abspath(__file__))
OK_LICENSE = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? \d)', re.I)
SHARD, NSHARDS = int(os.environ.get('SHARD', 0)), int(os.environ.get('NSHARDS', 1))
PER_RECIPE = 8


def get(url, tries=4, wait=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            print('  retry', i, e.code, url[:80], file=sys.stderr)
            time.sleep((30 if e.code == 429 else wait) * (i + 1))
        except Exception as e:
            print('  retry', i, e, file=sys.stderr)
            time.sleep(wait * (i + 1))
    return None


def clean(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def commons(q):
    params = {'action': 'query', 'generator': 'search', 'gsrsearch': f'{q} filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 5,
              'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 330, 'format': 'json', 'formatversion': '2'}
    raw = get(API + '?' + urllib.parse.urlencode(params))
    pages = sorted(json.loads(raw).get('query', {}).get('pages', []) if raw else [], key=lambda p: p.get('index', 99))
    out = []
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]
        m = ii.get('extmetadata', {})
        lic = clean(m.get('LicenseShortName', {}).get('value'))
        if ii.get('mime') not in ('image/jpeg', 'image/png', 'image/webp') or not OK_LICENSE.match(lic):
            continue
        out.append({'src': 'commons', 'file': p['title'].removeprefix('File:'), 'author': clean(m.get('Artist', {}).get('value'))[:80] or 'inconnu',
                    'license': lic, 'source': ii.get('descriptionurl'), 'thumb': ii.get('thumburl')})
    return out


def openverse(q):
    params = {'q': q, 'license': 'cc0,pdm,by,by-sa', 'page_size': 6, 'mature': 'false', 'extension': 'jpg,jpeg,png,webp'}
    raw = get(OV + '?' + urllib.parse.urlencode(params), wait=5)
    time.sleep(1.2)
    out = []
    for r in (json.loads(raw).get('results', []) if raw else []):
        lic = (r.get('license') or '').lower()
        label = 'CC0' if lic == 'cc0' else 'Domaine public' if lic == 'pdm' else f"CC {lic.upper()} {r.get('license_version') or ''}".strip()
        out.append({'src': 'openverse', 'id': r['id'], 'file': r.get('title') or r['id'], 'author': (r.get('creator') or 'inconnu')[:80],
                    'license': label, 'source': r.get('foreign_landing_url'), 'thumb': r.get('url'), 'url': r.get('url')})
    return out


def tile_image(c, size):
    raw = get(c['thumb'], tries=2)
    if not raw:
        return None
    try:
        im = Image.open(io.BytesIO(raw)).convert('RGB')
    except Exception:
        return None
    if min(im.size) < 200:
        return None
    im.thumbnail(size)
    return im


def sheet(rid, cands):
    tiles = []
    for c in cands:
        im = tile_image(c, (240, 200))
        if im:
            tiles.append((c, im))
    if not tiles:
        return []
    out = Image.new('RGB', (248 * len(tiles), 230), 'white')
    d = ImageDraw.Draw(out)
    d.text((4, 2), rid, fill='black')
    for i, (c, im) in enumerate(tiles):
        out.paste(im, (i * 248 + 4, 22))
        d.rectangle((i * 248 + 4, 22, i * 248 + 26, 42), fill='black')
        d.text((i * 248 + 10, 26), str(i + 1), fill='white')
    os.makedirs(os.path.join(HERE, 'sheets'), exist_ok=True)
    out.save(os.path.join(HERE, 'sheets', f'{rid}.jpg'), quality=68)
    return [c for c, _ in tiles]


def mine(rid):
    return int(hashlib.md5(rid.encode()).hexdigest(), 16) % NSHARDS == SHARD


def do_request():
    req = json.load(open(os.path.join(HERE, 'request.json')))
    os.makedirs(os.path.join(HERE, 'candidates'), exist_ok=True)
    path = os.path.join(HERE, 'candidates', f'{SHARD}.json')
    res = json.load(open(path)) if os.path.exists(path) else {}
    todo = [(rid, q) for rid, q in req.items() if mine(rid) and rid not in res]
    for n, (rid, queries) in enumerate(todo):
        seen, cm, ov = set(), [], []
        for q in [queries[0], queries[-1]]:
            for c in commons(q):
                if c['file'] not in seen:
                    seen.add(c['file']); cm.append(c)
        for c in openverse(queries[1] if len(queries) > 1 else queries[0]):
            if c['file'] not in seen:
                seen.add(c['file']); ov.append(c)
        mixed = [x for pair in zip(cm[:4], ov[:4]) for x in pair] + cm[len(ov[:4]):4] + ov[len(cm[:4]):4]
        cands = sheet(rid, mixed[:PER_RECIPE])
        res[rid] = [{k: v for k, v in c.items() if k != 'thumb'} for c in cands]
        print(n, '/', len(todo), rid, len(cands), flush=True)
        if n % 10 == 0:
            json.dump(res, open(path, 'w'), ensure_ascii=False, indent=0)
    json.dump(res, open(path, 'w'), ensure_ascii=False, indent=0)


def all_candidates():
    res = {}
    for f in glob.glob(os.path.join(HERE, 'candidates', '*.json')):
        res.update(json.load(open(f)))
    old = os.path.join(HERE, 'candidates.json')
    if os.path.exists(old):
        for k, v in json.load(open(old)).items():
            res.setdefault(k, v)
    return res


def do_chosen():
    chosen = json.load(open(os.path.join(HERE, 'chosen.json')))
    cands = all_candidates()
    out_dir = os.path.join(HERE, '..', 'cuisine-app', 'public', 'photos')
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for f in sorted(glob.glob(os.path.join(HERE, 'chosen-meta*.json'))):
        meta.update(json.load(open(f)))
    done = set(meta)
    for i, (rid, pick) in enumerate(chosen.items()):
        if not mine(rid):
            continue
        target = os.path.join(out_dir, f'{rid}.webp')
        if rid in done and os.path.exists(target):
            continue
        if isinstance(pick, dict):
            c = cands[rid][pick['c'] - 1]
        else:
            c = {'src': 'commons', 'file': pick}
        if c['src'] == 'commons':
            params = {'action': 'query', 'titles': f"File:{c['file']}", 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 960, 'format': 'json', 'formatversion': '2'}
            raw = get(API + '?' + urllib.parse.urlencode(params))
            p = (json.loads(raw).get('query', {}).get('pages') or [{}])[0] if raw else {}
            ii = (p.get('imageinfo') or [{}])[0]
            m = ii.get('extmetadata', {})
            url = ii.get('thumburl')
            info = {'file': c['file'], 'author': clean(m.get('Artist', {}).get('value'))[:80] or 'inconnu',
                    'license': clean(m.get('LicenseShortName', {}).get('value')), 'source': ii.get('descriptionurl')}
        else:
            url = c['url']
            info = {k: c[k] for k in ('file', 'author', 'license', 'source')}
        raw = url and get(url)
        if not raw:
            print('échec', rid, file=sys.stderr)
            continue
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        im.thumbnail((800, 800))
        im.save(target, 'WEBP', quality=72)
        meta[rid] = info
        print(i, rid, os.path.getsize(target) // 1024, 'ko', flush=True)
        time.sleep(0.3)
    mine_meta = {k: v for k, v in meta.items() if k not in done or not os.path.exists(os.path.join(out_dir, f'{k}.webp')) or k in chosen and mine(k)}
    path = os.path.join(HERE, f'chosen-meta-{SHARD}.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update({k: v for k, v in mine_meta.items() if mine(k)})
    json.dump(old, open(path, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    if os.path.exists(os.path.join(HERE, 'request.json')):
        do_request()
    if os.path.exists(os.path.join(HERE, 'chosen.json')):
        do_chosen()
