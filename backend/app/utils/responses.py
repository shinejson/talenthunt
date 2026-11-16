from flask import jsonify


def api_success(data=None, meta=None, status_code=200):
    payload = {
        "success": True,
        "data": data if data is not None else {},
        "meta": meta if meta is not None else {},
    }
    return jsonify(payload), status_code


def api_error(code: str, message: str, status_code: int = 400, fields: dict | None = None):
    payload = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "fields": fields if fields is not None else {},
        },
    }
    return jsonify(payload), status_code
