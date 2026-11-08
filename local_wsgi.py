"""Runs the unchanged business application inside Pyodide. No network server."""
import base64
import json
import os
from datetime import timedelta

BACKUP_ROUTE = '/configuracion/restaurar'
BACKUP_PATH = '/backup-input/respaldo.json'


def start(database, secret, token=None):
    global app, client
    os.environ['DATABASE_PATH'] = str(database)
    os.environ['SECRET_KEY'] = secret
    # Sockets are not available in WebAssembly; host checking remains enabled.
    from shopper import create_app
    import shopper
    shopper.trusted_hosts = lambda: ['localhost']
    app = create_app({'TRUSTED_HOSTS': ['localhost'], 'GEMINI_API_KEY': None,
                      'PERMANENT_SESSION_LIFETIME': timedelta(days=30)})
    from shopper.db import get_db
    with app.app_context():
        # A rollback journal avoids a second full-size database in the WASM filesystem.
        get_db().execute('PRAGMA journal_mode=DELETE')
    from flask import request, jsonify
    from shopper import gemini, files

    @app.post('/__local/ai/prepare')
    def local_ai_prepare():
        from shopper.domain import BusinessError
        images = files.read_uploads(request.files, request.form)
        if not any(image['kind'] == 'invoice' for image in images):
            raise BusinessError('Incluye al menos una foto etiquetada como Factura.')
        parts = [{'text': gemini.PROMPT}]
        for image in images:
            parts.extend([{'text': 'FACTURA' if image['kind'] == 'invoice' else 'PRODUCTO'},
                          {'inline_data': {'mime_type': image['mime'],
                                           'data': base64.b64encode(image['data']).decode('ascii')}}])
        return jsonify(parts=parts)

    @app.post('/__local/ai/normalize')
    def local_ai_normalize():
        return jsonify(gemini._normalize(json.loads(request.form['result'])))

    reset_client(token)


def reset_client(token=None):
    global client
    client = app.test_client()
    if token:
        client.set_cookie(app.config['SESSION_COOKIE_NAME'], token, domain='localhost')


def session_token():
    from itsdangerous import BadSignature

    cookie = client.get_cookie(app.config['SESSION_COOKIE_NAME'], domain='localhost')
    if cookie:
        signer = app.session_interface.get_signing_serializer(app)
        try:
            data = signer.loads(cookie.value, max_age=int(app.permanent_session_lifetime.total_seconds()))
        except BadSignature:
            return None
        if data.get('user_id'):
            return cookie.value
    return None


def dispatch(path, method='GET', body=b'', content_type=None, mounted_backup=False):
    if not path.startswith('/') or path.startswith('//'):
        raise ValueError('Ruta local inválida')
    if mounted_backup:
        if path != BACKUP_ROUTE or method != 'POST':
            raise ValueError('Ruta de respaldo inválida')
        from werkzeug.datastructures import FileStorage
        with open(BACKUP_PATH, 'rb') as stream:
            response = client.open(path, method=method, data=bytes(body), content_type=content_type,
                                   environ_overrides={'shopper.local_backup': FileStorage(stream, filename='respaldo.json')},
                                   follow_redirects=True)
    else:
        response = client.open(path, method=method, data=bytes(body),
                               content_type=content_type, follow_redirects=True)
    return json.dumps({'status': response.status_code,
                       'headers': {key: value for key, value in response.headers if key.lower() != 'set-cookie'},
                       'path': response.request.full_path.rstrip('?'),
                       'session': session_token(),
                       'body': base64.b64encode(response.data).decode('ascii')})
