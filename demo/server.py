"""Local single-case hackathon server. Run: python3 demo/server.py."""
import argparse
import hashlib
import json
import mimetypes
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from uuid import uuid4
from review import APPLICATION, KINDS, parse_document, assess

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 10 * 1024 * 1024

class State:
    def __init__(self):
        self.directory = tempfile.TemporaryDirectory(prefix='zero-form-review-')
        self.attachments = {}
        self.files = {}
        self.revision = 0
        self.decision = None
        self.lock = threading.RLock()
        self.generation_lock = threading.Lock()
        self.generations = {}
        self.generation = None
        self.application = None
    def close(self):
        self.directory.cleanup()

def extract_pdf(path):
    executable = os.environ.get('ZERO_FORM_PDFTOTEXT') or str(ROOT / '.tools/bin/pdftotext')
    if not Path(executable).is_file():
        executable = shutil.which('pdftotext')
    if not executable:
        raise RuntimeError('pdftotext_unavailable')
    result = subprocess.run([executable, '-f', '1', '-l', '1', '-layout', str(path), '-'],
                            capture_output=True, timeout=15)
    if result.returncode:
        raise ValueError('unreadable_pdf')
    return result.stdout.decode('utf-8', errors='replace')

def generate_package(state):
    executable = ROOT / 'target/debug/zero-form'
    if not executable.is_file():
        raise RuntimeError('core_not_built: run cargo build --workspace --locked')
    env = os.environ.copy()
    for variable, binary in [('ZERO_FORM_TYPST', 'typst'), ('ZERO_FORM_PDFTOPPM', 'pdftoppm'), ('ZERO_FORM_PDFTOTEXT', 'pdftotext')]:
        local = ROOT / '.tools/bin' / binary
        chosen = env.get(variable) or (str(local) if local.is_file() else shutil.which(binary))
        if not chosen:
            raise RuntimeError('missing_renderer: ' + binary)
        env[variable] = chosen
    identifier = str(uuid4())
    output = Path(state.directory.name) / identifier
    result = subprocess.run([str(executable), 'run', '--definition', 'bench/demo/definition.json',
        '--request', 'bench/demo/request.json', '--fixture-facts', 'bench/demo/facts.json',
        '--now', '2026-11-11', '--assets', '.', '--out', str(output)],
        cwd=ROOT, env=env, capture_output=True, timeout=120)
    if result.returncode:
        shutil.rmtree(output, ignore_errors=True)
        raise ValueError('generation_failed: ' + result.stderr.decode(errors='replace')[-2000:])
    manifest = json.loads((output / 'manifest.json').read_text())
    data = json.loads((output / 'application.data.json').read_text())
    if manifest.get('state') != 'verified_package':
        raise ValueError('package_not_verified')
    application = {'company_name': data['company.name'], 'capital_twd': data['capital.total'],
        'application_date': data['application.date'], 'address': APPLICATION['address'],
        'address_source': 'supplemental_demo_fixture'}
    documents, files = [], {}
    for artifact in manifest['artifacts']:
        if artifact['role'] != 'submission_document':
            continue
        relative = Path(artifact['path'])
        if len(relative.parts) != 2 or relative.parts[0] != 'documents' or not re.fullmatch(r'[A-Za-z0-9_-]+\.pdf', relative.name):
            raise ValueError('invalid_document_manifest')
        path = (output / relative).resolve()
        if not path.is_relative_to(output.resolve()) or not path.is_file():
            raise ValueError('missing_document')
        files[relative.name] = path
        url = '/api/generations/' + identifier + '/documents/' + relative.name
        documents.append({'id': relative.stem, 'name': relative.name, 'preview_url': url, 'download_url': url+'?download=1'})
    if not documents:
        raise ValueError('empty_document_manifest')
    metadata = {'id': identifier, 'status': 'ready', 'mode': 'demo_only',
        'snapshot_hash': manifest['snapshot_hash'], 'documents': documents, 'application': application}
    with state.lock:
        state.generations[identifier] = {'metadata': metadata, 'files': files}
        state.generation = metadata
        state.application = application
        state.revision += 1
        state.decision = None
    return metadata

def make_server(host='127.0.0.1', port=8787, state=None):
    state = state or State()
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
        def serve_file(self, path, content_type=None, download=False):
            body = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type or mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            if content_type == 'application/pdf':
                self.send_header('Content-Disposition', ('attachment' if download else 'inline') + '; filename="' + path.name + '"')
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            path = urlparse(self.path).path
            with state.lock:
                if path == '/api/case':
                    return self.reply(200, {'mode': 'demo_only', 'application': state.application or APPLICATION, 'generation': state.generation,
                        'attachments': list(state.attachments.values()), 'evidence_revision': state.revision,
                        'decision': state.decision, 'review': assess(state.attachments, state.revision, state.application)})
                if path == '/api/review':
                    return self.reply(200, {**assess(state.attachments, state.revision, state.application), 'decision': state.decision})
                if path.startswith('/api/generations/'):
                    parts = path.split('/')
                    generation = state.generations.get(parts[3]) if len(parts) >= 4 else None
                    if not generation:
                        return self.reply(404, {'error': 'generation_not_ready_or_unknown'})
                    if len(parts) == 4:
                        return self.reply(200, generation['metadata'])
                    file = generation['files'].get(parts[5]) if len(parts) == 6 and parts[4] == 'documents' else None
                    return self.serve_file(file, 'application/pdf', parse_qs(urlparse(self.path).query).get('download') == ['1']) if file else self.reply(404, {'error': 'document_not_found'})
                if path.startswith('/api/attachments/'):
                    file = state.files.get(path.rsplit('/', 1)[-1])
                    return self.serve_file(file, 'application/pdf') if file else self.reply(404, {'error': 'not_found'})
            if path == '/api/fixtures':
                base = ROOT / 'bench/review'
                return self.reply(200, {'fixtures': [{'name': p.name, 'url': '/fixtures/' + p.name}
                                      for p in sorted(base.glob('*.pdf'))]})
            if path.startswith('/fixtures/'):
                base = (ROOT / 'bench/review').resolve()
                candidate = (base / path.removeprefix('/fixtures/')).resolve()
            else:
                base = (ROOT / 'demo/web').resolve()
                candidate = (base / (path.lstrip('/') or 'index.html')).resolve()
            if candidate.is_relative_to(base) and candidate.is_file():
                return self.serve_file(candidate)
            self.reply(404, {'error': 'not_found'})
        def do_POST(self):
            parsed = urlparse(self.path)
            # Same-origin local demo only; do not allow browser cross-origin writes.
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', ''):
                return self.reply(403, {'error': 'cross_origin_denied'})
            try:
                size = int(self.headers.get('Content-Length', '-1'))
            except ValueError:
                size = -1
            limit = MAX_UPLOAD if parsed.path == '/api/attachments' else 16384
            if size < 0 or size > limit:
                self.close_connection = True
                return self.reply(413 if size > limit else 411, {'error': 'invalid_body_size'})
            payload = self.rfile.read(size)
            if parsed.path == '/api/generate':
                try:
                    if payload and json.loads(payload) != {}:
                        return self.reply(400, {'error': 'fixed_demo_accepts_no_parameters'})
                except ValueError:
                    return self.reply(400, {'error': 'invalid_json'})
                if not state.generation_lock.acquire(blocking=False):
                    return self.reply(409, {'error': 'generation_busy'})
                try:
                    return self.reply(201, generate_package(state))
                except subprocess.TimeoutExpired:
                    return self.reply(504, {'error': 'generation_timeout'})
                except RuntimeError as error:
                    return self.reply(503, {'error': str(error)})
                except (ValueError, OSError, KeyError, TypeError) as error:
                    return self.reply(422, {'error': 'generation_failed', 'detail': str(error)})
                finally:
                    state.generation_lock.release()
            if parsed.path == '/api/attachments':
                kind = parse_qs(parsed.query).get('kind', [''])[0]
                if kind not in KINDS or self.headers.get_content_type() != 'application/pdf' or not payload.startswith(b'%PDF-'):
                    return self.reply(400, {'error': 'expected_demo_pdf_and_supported_kind'})
                identifier = str(uuid4())
                file = Path(state.directory.name) / (identifier + '.pdf')
                try:
                    file.write_bytes(payload)
                    fields = parse_document(extract_pdf(file), kind)
                except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as error:
                    file.unlink(missing_ok=True)
                    return self.reply(422, {'error': str(error)})
                with state.lock:
                    attachment = {'id': identifier, 'kind': kind, 'fields': fields,
                                  'sha256': hashlib.sha256(payload).hexdigest(), 'url': '/api/attachments/' + identifier}
                    state.files[identifier] = file
                    state.attachments[kind] = attachment
                    state.revision += 1
                    state.decision = None
                    return self.reply(201, {'attachment': attachment, 'evidence_revision': state.revision,
                                           'review': assess(state.attachments, state.revision, state.application)})
            if parsed.path == '/api/decision':
                try:
                    data = json.loads(payload)
                    decision = data['decision']
                    reason = data.get('reason', '')
                    expected_revision = data['evidence_revision']
                    if type(expected_revision) is not int:
                        raise ValueError()
                    if decision not in ('approve', 'request_documents', 'decline') or not isinstance(reason, str):
                        raise ValueError()
                    if decision != 'approve' and not reason.strip():
                        return self.reply(400, {'error': 'reason_required'})
                except (ValueError, KeyError, TypeError):
                    return self.reply(400, {'error': 'invalid_decision'})
                with state.lock:
                    review = assess(state.attachments, state.revision, state.application)
                    if expected_revision != state.revision:
                        return self.reply(409, {'error': 'evidence_revision_changed', 'review': review})
                    if decision == 'approve' and review['recommendation'] != 'approve':
                        return self.reply(409, {'error': 'unresolved_checks', 'review': review})
                    state.decision = {'decision': decision, 'reason': reason.strip(), 'mode': 'demo_only',
                                      'evidence_revision': state.revision, 'checks': review['checks'],
                                      'generation_id': state.generation['id'] if state.generation else None,
                                      'snapshot_hash': state.generation['snapshot_hash'] if state.generation else None}
                    return self.reply(200, state.decision)
            self.reply(404, {'error': 'not_found'})
    server = ThreadingHTTPServer((host, port), Handler)
    server.demo_state = state
    return server

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8787)
    args = parser.parse_args()
    server = make_server(port=args.port)
    print('Demo reviewer: http://127.0.0.1:' + str(server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.demo_state.close()
