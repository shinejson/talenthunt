from flask import request


def paginate_query(query, serializer_fn=None, default_per_page=20, max_per_page=100):
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = min(max_per_page, max(1, int(request.args.get("per_page", default_per_page))))
    except (TypeError, ValueError):
        per_page = default_per_page

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    serialized = [serializer_fn(item) for item in items] if serializer_fn else items
    pages = (total + per_page - 1) // per_page if per_page else 1
    meta = {
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
    }
    return serialized, meta
