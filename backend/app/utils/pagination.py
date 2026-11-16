from flask import request
from sqlalchemy import String, func


def apply_sort(query, sortable=None, default_order=None):
    """Order ``query`` from the ``sort_by`` / ``sort_dir`` query parameters.

    The DataTables UI sends ``sort_by=<column key>&sort_dir=asc|desc`` when a column
    header is clicked. Only keys present in ``sortable`` (a ``{key: column}`` or
    ``{key: [column, ...]}`` whitelist) are honoured, so arbitrary user input never
    reaches ``ORDER BY``. ``default_order`` is used when no (valid) column sort is
    requested and is appended as a tie-breaker otherwise so that paging stays stable.

    Text columns are ordered case-insensitively ("apple" before "Zebra") so the result
    does not depend on the database's default collation.
    """
    defaults = list(default_order or [])
    sort_key = (request.args.get("sort_by") or "").strip().lower()
    columns = (sortable or {}).get(sort_key) if sort_key else None
    if columns is None:
        return query.order_by(*defaults) if defaults else query

    if not isinstance(columns, (list, tuple)):
        columns = [columns]
    descending = (request.args.get("sort_dir") or "").strip().lower() == "desc"
    ordering = []
    for col in columns:
        expr = func.lower(col) if isinstance(getattr(col, "type", None), String) else col
        ordering.append(expr.desc() if descending else expr.asc())
    return query.order_by(None).order_by(*ordering, *defaults)


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
