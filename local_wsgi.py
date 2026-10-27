"""Runs the unchanged business application inside Pyodide. No network server."""
import base64
import io
import json
import os
from pathlib import Path


def start(database, secret):
    global app, client
    os.environ['DATABASE_PATH'] = str(database)
    os.environ['SECRET_KEY'] = secret
    # Sockets are not available in WebAssembly; host checking remains enabled.
    from shopper import create_app
    import shopper
    shopper.trusted_hosts = lambda: ['localhost']
    app = create_app({'TRUSTED_HOSTS': ['localhost'], 'GEMINI_API_KEY': None})
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

    client = app.test_client()


def dispatch(path, method='GET', body=b'', content_type=None):
    if not path.startswith('/') or path.startswith('//'):
        raise ValueError('Ruta local inválida')
    response = client.open(path, method=method, data=bytes(body),
                           content_type=content_type, follow_redirects=True)
    return json.dumps({'status': response.status_code,
                       'headers': dict(response.headers),
                       'path': response.request.full_path.rstrip('?'),
                       'body': base64.b64encode(response.data).decode('ascii')})
