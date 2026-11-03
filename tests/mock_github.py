# Minimaler Nachbau der GitHub-API-Teile, die die App benutzt (nur zum Testen)
import json, hashlib, base64, re, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LOCK = threading.Lock()
BLOBS = {}; TREES = {}; COMMITS = {}; REF = {'main': None}
def h(b): return hashlib.sha1(b).hexdigest()
def head_files():
    c = REF['main']
    return dict(TREES[COMMITS[c]['tree']]) if c else {}
class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type, X-GitHub-Api-Version')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, OPTIONS')
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def out(self, code, obj=None, raw=None):
        self.send_response(code); self.cors()
        body = raw if raw is not None else (json.dumps(obj).encode() if obj is not None else b'')
        self.send_header('Content-Type', 'application/octet-stream' if raw is not None else 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')
    def auth(self):
        if self.headers.get('Authorization') != 'Bearer github_pat_TESTTESTTESTTESTTEST':
            self.out(401, {'message': 'Bad credentials'}); return False
        return True
    def route(self, m):
        if not self.auth(): return
        p = self.path.split('?')[0]
        mm = re.match(r'^/repos/fam/rezepte(/.*)?$', p)
        if not mm: return self.out(404, {'message': 'Not Found'})
        rest = mm.group(1) or ''
        with LOCK:
            if rest == '' and m == 'GET': return self.out(200, {'full_name': 'fam/rezepte', 'default_branch': 'main', 'permissions': {'push': True}})
            if rest == '/git/ref/heads/main' and m == 'GET':
                if not REF['main']: return self.out(409, {'message': 'Git Repository is empty.'})
                return self.out(200, {'object': {'sha': REF['main']}})
            mc = re.match(r'^/git/commits/(\w+)$', rest)
            if mc and m == 'GET': c = COMMITS[mc.group(1)]; return self.out(200, {'sha': mc.group(1), 'tree': {'sha': c['tree']}})
            if rest == '/git/blobs' and m == 'POST':
                b = base64.b64decode(self.body()['content']); s = h(b); BLOBS[s] = b; return self.out(201, {'sha': s})
            if rest == '/git/trees' and m == 'POST':
                d = self.body(); files = dict(TREES[d['base_tree']]) if d.get('base_tree') else {}
                for e in d['tree']:
                    if 'content' in e: b = e['content'].encode(); s = h(b); BLOBS[s] = b; files[e['path']] = s
                    elif e.get('sha') is None:
                        if e['path'] not in files: return self.out(422, {'message': 'path not found ' + e['path']})
                        del files[e['path']]
                    else: files[e['path']] = e['sha']
                s = h(json.dumps(sorted(files.items())).encode()); TREES[s] = files; return self.out(201, {'sha': s})
            if rest == '/git/commits' and m == 'POST':
                d = self.body(); s = h(json.dumps(d).encode() + str(len(COMMITS)).encode()); COMMITS[s] = {'tree': d['tree'], 'parents': d['parents']}; return self.out(201, {'sha': s})
            if rest == '/git/refs/heads/main' and m == 'PATCH':
                d = self.body()
                if COMMITS[d['sha']]['parents'] != [REF['main']]: return self.out(422, {'message': 'Update is not a fast forward'})
                REF['main'] = d['sha']; return self.out(200, {'object': {'sha': d['sha']}})
            mf = re.match(r'^/contents/(.+)$', rest)
            if mf and m == 'GET':
                f = head_files().get(mf.group(1))
                return self.out(200, raw=BLOBS[f]) if f else self.out(404, {'message': 'Not Found'})
            if mf and m == 'PUT':
                d = self.body(); b = base64.b64decode(d['content']); s = h(b); BLOBS[s] = b
                files = head_files(); files[mf.group(1)] = s
                ts = h(json.dumps(sorted(files.items())).encode()); TREES[ts] = files
                cs = h(ts.encode() + b'put'); COMMITS[cs] = {'tree': ts, 'parents': [REF['main']] if REF['main'] else []}; REF['main'] = cs
                return self.out(201, {'content': {}})
        self.out(404, {'message': 'Not Found ' + m + ' ' + rest})
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def do_PATCH(self): self.route('PATCH')
    def do_PUT(self): self.route('PUT')
    def log_message(self, *a): pass
ThreadingHTTPServer(('', int(__import__('sys').argv[1]) if len(__import__('sys').argv) > 1 else 8201), H).serve_forever()
