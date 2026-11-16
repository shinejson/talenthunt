import re
from urllib.parse import urlparse

from sqlalchemy import or_

from app.extensions import db
from app.models.application import MediaAsset
from app.models.competition import Competition
from app.models.operations import PlatformSetting
from app.models.partnership import (
    DEFAULT_COLLABORATION_TRACKS,
    DEFAULT_SPONSORSHIP_PACKAGES,
    INQUIRY_STATUSES,
    ORG_KINDS,
    ORG_STATUSES,
    PARTNER_CATEGORIES,
    PARTNER_CATEGORY_LIST,
    SPONSOR_TIERS,
    SPONSOR_TIER_LIST,
    PartnershipInquiry,
    SponsorPartner,
)
from app.models.user import User
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.utils.security import generate_reference, slugify
from app.utils.time_utils import utcnow

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
IMAGE_UPLOAD_EXTENSIONS = {"jpg", "jpeg", "png", "gif"}


def validate_http_url(raw_url: str | None, field_name: str = "website_url") -> str | None:
    if raw_url is None:
        return None
    cleaned = str(raw_url).strip()
    if not cleaned:
        return None
    if len(cleaned) > 500:
        raise DomainError("INVALID_URL", f"{field_name} exceeds maximum length of 500 characters.", 422, {field_name: ["URL is too long."]})
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DomainError(
            "INVALID_URL",
            f"{field_name} must be a valid http:// or https:// URL.",
            422,
            {field_name: ["Enter a valid URL starting with https:// or http://."]},
        )
    return cleaned


def validate_logo_url(raw_url: str | None) -> str | None:
    if raw_url is None:
        return None
    cleaned = str(raw_url).strip()
    if not cleaned:
        return None
    if (cleaned.startswith("/uploads/") or cleaned.startswith("/assets/")) and ".." not in cleaned and not cleaned.startswith("//"):
        if len(cleaned) > 500:
            raise DomainError("INVALID_URL", "logo_url exceeds maximum length.", 422, {"logo_url": ["Logo path is too long."]})
        return cleaned
    return validate_http_url(cleaned, field_name="logo_url")


def validate_accent_color(raw_color: str | None, kind: str = "SPONSOR") -> str:
    default = "#d97706" if kind == "SPONSOR" else "#059669"
    if not raw_color:
        return default
    cleaned = str(raw_color).strip()
    if not HEX_COLOR_RE.match(cleaned):
        raise DomainError(
            "VALIDATION_ERROR",
            "Accent color must be a 6-digit hex color such as #d97706.",
            422,
            {"accent_color": ["Use a valid hex color (e.g. #d97706)."]},
        )
    return cleaned.lower()


def normalize_highlights(raw_value) -> list[str]:
    if raw_value is None:
        return []
    items: list[str] = []
    if isinstance(raw_value, list):
        items = [str(x).strip() for x in raw_value if str(x).strip()]
    elif isinstance(raw_value, str):
        lines = raw_value.replace("\r\n", "\n").split("\n")
        if len(lines) == 1 and "," in raw_value:
            lines = raw_value.split(",")
        items = [line.strip().lstrip("-•* ").strip() for line in lines if line.strip().lstrip("-•* ").strip()]
    else:
        raise DomainError("VALIDATION_ERROR", "Highlights must be a list of short text items.", 422)
    return [item[:140] for item in items[:8]]


def validate_tier_or_category(kind: str, code: str | None, required: bool = True) -> str | None:
    cleaned = (str(code).strip().upper() if code is not None else "")
    if not cleaned:
        if required:
            label = "sponsorship tier" if kind == "SPONSOR" else "partner category"
            raise DomainError("VALIDATION_ERROR", f"A valid {label} is required.", 422)
        return None
    valid_map = SPONSOR_TIERS if kind == "SPONSOR" else PARTNER_CATEGORIES
    if cleaned not in valid_map:
        allowed = ", ".join(valid_map.keys())
        raise DomainError(
            "VALIDATION_ERROR",
            f"Invalid {'tier' if kind == 'SPONSOR' else 'category'} '{cleaned}'. Allowed values: {allowed}.",
            422,
            {"tier_or_category": [f"Choose one of: {allowed}."]},
        )
    return cleaned


def _validate_logo_asset(logo_asset_id: str | None) -> str | None:
    if not logo_asset_id:
        return None
    asset = db.session.get(MediaAsset, str(logo_asset_id).strip())
    if not asset or asset.scan_status != "CLEAN":
        raise DomainError("INVALID_LOGO_ASSET", "Uploaded logo asset was not found or did not pass security scanning.", 422)
    ext = asset.storage_key.rsplit(".", 1)[-1].lower() if "." in asset.storage_key else ""
    if not (asset.mime_type or "").startswith("image/") and ext not in IMAGE_UPLOAD_EXTENSIONS:
        raise DomainError("INVALID_LOGO_ASSET", "Logo file must be a PNG, JPG, or GIF image.", 422)
    return asset.id


def _ensure_unique_slug(base_text: str, exclude_id: str | None = None) -> str:
    base = slugify(base_text)[:120]
    candidate = base
    suffix = 2
    while True:
        existing = SponsorPartner.query.filter_by(slug=candidate).first()
        if not existing or (exclude_id and existing.id == exclude_id):
            return candidate
        candidate = f"{base[:112]}-{suffix}"
        suffix += 1


def _parse_optional_int(raw_val, field_name: str, min_val: int, max_val: int) -> int | None:
    if raw_val is None or raw_val == "":
        return None
    try:
        num = int(raw_val)
    except (TypeError, ValueError):
        raise DomainError("VALIDATION_ERROR", f"{field_name} must be a whole number.", 422, {field_name: ["Must be a valid integer."]})
    if num < min_val or num > max_val:
        raise DomainError("VALIDATION_ERROR", f"{field_name} must be between {min_val} and {max_val}.", 422)
    return num


def sort_public_orgs(orgs: list[SponsorPartner]) -> list[SponsorPartner]:
    def _sort_key(org: SponsorPartner):
        if org.kind == "SPONSOR":
            tier_rank = SPONSOR_TIERS.get(org.tier_or_category, {}).get("rank", 99)
            return (tier_rank, org.sort_order, 0 if org.is_featured else 1, (org.name or "").lower())
        cat_rank = PARTNER_CATEGORIES.get(org.tier_or_category, {}).get("rank", 99)
        return (0 if org.is_featured else 1, org.sort_order, cat_rank, (org.name or "").lower())

    return sorted(orgs, key=_sort_key)


def query_public_orgs(
    kind: str,
    tier_or_category: str | None = None,
    competition_ref: str | None = None,
    featured_only: bool = False,
    search: str | None = None,
    include_platform_wide: bool = True,
) -> list[SponsorPartner]:
    kind_up = kind.upper()
    q = SponsorPartner.query.outerjoin(Competition, SponsorPartner.competition_id == Competition.id).filter(
        SponsorPartner.kind == kind_up,
        SponsorPartner.status == "ACTIVE",
        or_(
            SponsorPartner.competition_id.is_(None),
            Competition.status.notin_(["DRAFT", "ARCHIVED"]),
        ),
    )

    if tier_or_category:
        q = q.filter(SponsorPartner.tier_or_category == tier_or_category.strip().upper())

    if competition_ref:
        ref = competition_ref.strip()
        comp = Competition.query.filter(or_(Competition.slug == ref, Competition.id == ref)).first()
        if not comp or comp.status in ("DRAFT", "ARCHIVED"):
            return []
        if include_platform_wide:
            q = q.filter(or_(SponsorPartner.competition_id == comp.id, SponsorPartner.competition_id.is_(None)))
        else:
            q = q.filter(SponsorPartner.competition_id == comp.id)

    if featured_only:
        q = q.filter(SponsorPartner.is_featured.is_(True))

    if search and search.strip():
        like_pat = f"%{search.strip()}%"
        q = q.filter(
            or_(
                SponsorPartner.name.ilike(like_pat),
                SponsorPartner.tagline.ilike(like_pat),
                SponsorPartner.description.ilike(like_pat),
                SponsorPartner.badge_label.ilike(like_pat),
                SponsorPartner.contribution_summary.ilike(like_pat),
                SponsorPartner.location.ilike(like_pat),
            )
        )

    return sort_public_orgs(q.all())


def get_sponsorship_packages() -> list[dict]:
    setting = PlatformSetting.query.filter_by(key="sponsorship_packages").first()
    if setting and isinstance(setting.value_json, dict) and isinstance(setting.value_json.get("items"), list):
        return setting.value_json["items"]
    return DEFAULT_SPONSORSHIP_PACKAGES


def get_collaboration_tracks() -> list[dict]:
    setting = PlatformSetting.query.filter_by(key="collaboration_tracks").first()
    if setting and isinstance(setting.value_json, dict) and isinstance(setting.value_json.get("items"), list):
        return setting.value_json["items"]
    return DEFAULT_COLLABORATION_TRACKS


def create_sponsor_or_partner(actor: User, payload: dict) -> SponsorPartner:
    kind = str(payload.get("kind") or "SPONSOR").strip().upper()
    if kind not in ORG_KINDS:
        raise DomainError("VALIDATION_ERROR", "kind must be SPONSOR or PARTNER.", 422)

    name = str(payload.get("name") or "").strip()
    if len(name) < 2 or len(name) > 160:
        raise DomainError("VALIDATION_ERROR", "Organization name is required (2–160 characters).", 422, {"name": ["Enter a valid name."]})

    tier_or_category = validate_tier_or_category(kind, payload.get("tier_or_category"), required=True)

    status = str(payload.get("status") or "ACTIVE").strip().upper()
    if status not in ORG_STATUSES:
        raise DomainError("VALIDATION_ERROR", f"Invalid status '{status}'. Allowed: {', '.join(sorted(ORG_STATUSES))}.", 422)

    comp_id = str(payload.get("competition_id") or "").strip() or None
    if comp_id:
        comp = db.session.get(Competition, comp_id)
        if not comp:
            raise DomainError("NOT_FOUND", "Selected competition not found.", 404)

    contact_email = str(payload.get("contact_email") or "").strip() or None
    if contact_email and not EMAIL_RE.match(contact_email):
        raise DomainError("VALIDATION_ERROR", "Internal contact email is invalid.", 422, {"contact_email": ["Enter a valid email address."]})

    slug = _ensure_unique_slug(str(payload.get("slug") or "").strip() or name)
    since_year = _parse_optional_int(payload.get("since_year"), "since_year", 1950, 2100)
    sort_order = _parse_optional_int(payload.get("sort_order"), "sort_order", -1000, 100000)
    if sort_order is None:
        sort_order = 100

    initials_raw = str(payload.get("brand_initials") or "").strip().upper()[:6] or None

    org = SponsorPartner(
        kind=kind,
        name=name,
        slug=slug,
        tier_or_category=tier_or_category,
        competition_id=comp_id,
        badge_label=(str(payload.get("badge_label") or "").strip()[:120] or None),
        tagline=(str(payload.get("tagline") or "").strip()[:255] or None),
        description=(str(payload.get("description") or "").strip() or None),
        contribution_summary=(str(payload.get("contribution_summary") or "").strip()[:255] or None),
        highlights_json=normalize_highlights(payload.get("highlights")),
        quote_text=(str(payload.get("quote_text") or "").strip() or None),
        quote_author=(str(payload.get("quote_author") or "").strip()[:160] or None),
        website_url=validate_http_url(payload.get("website_url"), "website_url"),
        logo_url=validate_logo_url(payload.get("logo_url")),
        logo_asset_id=_validate_logo_asset(payload.get("logo_asset_id")),
        brand_initials=initials_raw,
        accent_color=validate_accent_color(payload.get("accent_color"), kind=kind),
        location=(str(payload.get("location") or "").strip()[:150] or None),
        since_year=since_year,
        contact_name=(str(payload.get("contact_name") or "").strip()[:150] or None),
        contact_email=contact_email,
        contact_phone=(str(payload.get("contact_phone") or "").strip()[:40] or None),
        internal_notes=(str(payload.get("internal_notes") or "").strip() or None),
        is_featured=bool(payload.get("is_featured", False)),
        sort_order=sort_order,
        status=status,
        created_by=actor.id,
    )
    db.session.add(org)
    db.session.flush()

    entity_type = "sponsor" if org.kind == "SPONSOR" else "partner"
    log_audit(
        actor_user_id=actor.id,
        action=f"{org.kind}_CREATED",
        entity_type=entity_type,
        entity_id=org.id,
        after={"name": org.name, "slug": org.slug, "tier_or_category": org.tier_or_category, "status": org.status},
    )
    db.session.commit()
    return org


def update_sponsor_or_partner(actor: User, org: SponsorPartner, payload: dict) -> SponsorPartner:
    before = {
        "name": org.name,
        "kind": org.kind,
        "tier_or_category": org.tier_or_category,
        "status": org.status,
        "is_featured": org.is_featured,
        "sort_order": org.sort_order,
    }

    new_kind = org.kind
    if "kind" in payload and payload["kind"] is not None:
        candidate_kind = str(payload["kind"]).strip().upper()
        if candidate_kind not in ORG_KINDS:
            raise DomainError("VALIDATION_ERROR", "kind must be SPONSOR or PARTNER.", 422)
        new_kind = candidate_kind

    if new_kind != org.kind or "tier_or_category" in payload:
        org.tier_or_category = validate_tier_or_category(
            new_kind,
            payload.get("tier_or_category") if "tier_or_category" in payload else org.tier_or_category,
            required=True,
        )
    org.kind = new_kind

    if "name" in payload:
        name = str(payload.get("name") or "").strip()
        if len(name) < 2 or len(name) > 160:
            raise DomainError("VALIDATION_ERROR", "Organization name must be 2–160 characters.", 422)
        org.name = name

    if "slug" in payload and str(payload.get("slug") or "").strip():
        org.slug = _ensure_unique_slug(str(payload["slug"]).strip(), exclude_id=org.id)

    if "status" in payload:
        st = str(payload.get("status") or "").strip().upper()
        if st not in ORG_STATUSES:
            raise DomainError("VALIDATION_ERROR", f"Invalid status '{st}'.", 422)
        org.status = st

    if "competition_id" in payload:
        comp_id = str(payload.get("competition_id") or "").strip() or None
        if comp_id:
            comp = db.session.get(Competition, comp_id)
            if not comp:
                raise DomainError("NOT_FOUND", "Selected competition not found.", 404)
        org.competition_id = comp_id

    for field, max_len in (
        ("badge_label", 120),
        ("tagline", 255),
        ("contribution_summary", 255),
        ("quote_author", 160),
        ("location", 150),
        ("contact_name", 150),
        ("contact_phone", 40),
    ):
        if field in payload:
            val = str(payload.get(field) or "").strip()
            setattr(org, field, val[:max_len] if val else None)

    for text_field in ("description", "quote_text", "internal_notes"):
        if text_field in payload:
            val = str(payload.get(text_field) or "").strip()
            setattr(org, text_field, val or None)

    if "contact_email" in payload:
        email = str(payload.get("contact_email") or "").strip() or None
        if email and not EMAIL_RE.match(email):
            raise DomainError("VALIDATION_ERROR", "Internal contact email is invalid.", 422, {"contact_email": ["Enter a valid email address."]})
        org.contact_email = email

    if "highlights" in payload:
        org.highlights_json = normalize_highlights(payload.get("highlights"))

    if "website_url" in payload:
        org.website_url = validate_http_url(payload.get("website_url"), "website_url")

    if "logo_url" in payload:
        org.logo_url = validate_logo_url(payload.get("logo_url"))

    if "logo_asset_id" in payload:
        raw_asset = payload.get("logo_asset_id")
        org.logo_asset_id = _validate_logo_asset(raw_asset) if raw_asset else None

    if "brand_initials" in payload:
        org.brand_initials = str(payload.get("brand_initials") or "").strip().upper()[:6] or None

    if "accent_color" in payload:
        org.accent_color = validate_accent_color(payload.get("accent_color"), kind=org.kind)

    if "since_year" in payload:
        org.since_year = _parse_optional_int(payload.get("since_year"), "since_year", 1950, 2100)

    if "sort_order" in payload:
        parsed_order = _parse_optional_int(payload.get("sort_order"), "sort_order", -1000, 100000)
        org.sort_order = 100 if parsed_order is None else parsed_order

    if "is_featured" in payload:
        org.is_featured = bool(payload["is_featured"])

    after = {
        "name": org.name,
        "kind": org.kind,
        "tier_or_category": org.tier_or_category,
        "status": org.status,
        "is_featured": org.is_featured,
        "sort_order": org.sort_order,
    }
    entity_type = "sponsor" if org.kind == "SPONSOR" else "partner"
    log_audit(
        actor_user_id=actor.id,
        action=f"{org.kind}_UPDATED",
        entity_type=entity_type,
        entity_id=org.id,
        before=before,
        after=after,
    )
    db.session.commit()
    return org


def delete_sponsor_or_partner(actor: User, org: SponsorPartner) -> None:
    entity_type = "sponsor" if org.kind == "SPONSOR" else "partner"
    snapshot = {"name": org.name, "slug": org.slug, "kind": org.kind, "tier_or_category": org.tier_or_category}
    org_id = org.id
    kind = org.kind
    db.session.delete(org)
    log_audit(
        actor_user_id=actor.id,
        action=f"{kind}_DELETED",
        entity_type=entity_type,
        entity_id=org_id,
        before=snapshot,
    )
    db.session.commit()


def create_partnership_inquiry(payload: dict) -> PartnershipInquiry:
    inquiry_type = str(payload.get("inquiry_type") or "SPONSOR").strip().upper()
    if inquiry_type not in ORG_KINDS:
        raise DomainError("VALIDATION_ERROR", "inquiry_type must be SPONSOR or PARTNER.", 422)

    org_name = str(payload.get("organization_name") or "").strip()
    contact_name = str(payload.get("contact_name") or "").strip()
    contact_email = str(payload.get("contact_email") or "").strip()
    contact_phone = str(payload.get("contact_phone") or "").strip()[:40] or None
    goals_message = str(payload.get("goals_message") or "").strip()

    errors = {}
    if len(org_name) < 2 or len(org_name) > 160:
        errors["organization_name"] = ["Organization or brand name is required (2–160 characters)."]
    if len(contact_name) < 2 or len(contact_name) > 150:
        errors["contact_name"] = ["Contact person's full name is required."]
    if not contact_email or not EMAIL_RE.match(contact_email):
        errors["contact_email"] = ["A valid business email address is required."]
    if len(goals_message) < 15:
        errors["goals_message"] = ["Please share a brief overview of your goals (at least 15 characters)."]
    elif len(goals_message) > 4000:
        errors["goals_message"] = ["Message must not exceed 4,000 characters."]

    if errors:
        first_msg = next(iter(errors.values()))[0]
        raise DomainError("VALIDATION_ERROR", first_msg, 422, errors)

    desired = validate_tier_or_category(inquiry_type, payload.get("desired_tier_or_category"), required=False)
    website_url = validate_http_url(payload.get("website_url"), "website_url")

    comp_id = str(payload.get("competition_id") or "").strip() or None
    if comp_id:
        comp = db.session.get(Competition, comp_id)
        if not comp or comp.status in ("DRAFT", "ARCHIVED"):
            raise DomainError("VALIDATION_ERROR", "Selected competition is unavailable.", 422)

    prefix = "SPN" if inquiry_type == "SPONSOR" else "PRT"
    inquiry = PartnershipInquiry(
        reference_no=generate_reference(prefix),
        inquiry_type=inquiry_type,
        organization_name=org_name,
        contact_name=contact_name,
        contact_role=(str(payload.get("contact_role") or "").strip()[:120] or None),
        contact_email=contact_email[:255],
        contact_phone=contact_phone,
        website_url=website_url,
        location=(str(payload.get("location") or "").strip()[:150] or None),
        desired_tier_or_category=desired,
        competition_id=comp_id,
        budget_range=(str(payload.get("budget_range") or "").strip()[:100] or None),
        goals_message=goals_message,
        status="NEW",
    )
    db.session.add(inquiry)
    db.session.commit()
    return inquiry


def update_partnership_inquiry(actor: User, inquiry: PartnershipInquiry, payload: dict) -> PartnershipInquiry:
    before = {"status": inquiry.status, "admin_notes": inquiry.admin_notes}
    if "status" in payload and payload["status"] is not None:
        st = str(payload["status"]).strip().upper()
        if st not in INQUIRY_STATUSES:
            raise DomainError(
                "VALIDATION_ERROR",
                f"Invalid inquiry status '{st}'. Allowed: {', '.join(sorted(INQUIRY_STATUSES))}.",
                422,
            )
        inquiry.status = st
    if "admin_notes" in payload:
        notes = str(payload.get("admin_notes") or "").strip()
        inquiry.admin_notes = notes or None

    inquiry.reviewed_by = actor.id
    inquiry.reviewed_at = utcnow()

    log_audit(
        actor_user_id=actor.id,
        action="PARTNERSHIP_INQUIRY_UPDATED",
        entity_type="partnership_inquiry",
        entity_id=inquiry.id,
        before=before,
        after={"status": inquiry.status, "reference_no": inquiry.reference_no},
    )
    db.session.commit()
    return inquiry


def convert_inquiry_to_org(actor: User, inquiry: PartnershipInquiry, overrides: dict | None = None) -> SponsorPartner:
    if inquiry.converted_org_id and inquiry.converted_org:
        raise DomainError(
            "ALREADY_CONVERTED",
            f"This inquiry has already been promoted to '{inquiry.converted_org.name}'.",
            409,
        )

    overrides = overrides or {}
    kind = inquiry.inquiry_type
    default_tier = "GOLD" if kind == "SPONSOR" else "COMMUNITY_YOUTH"
    tier_code = validate_tier_or_category(
        kind,
        overrides.get("tier_or_category") or inquiry.desired_tier_or_category or default_tier,
        required=True,
    )
    publish_status = str(overrides.get("status") or "ACTIVE").strip().upper()
    if publish_status not in ORG_STATUSES:
        raise DomainError("VALIDATION_ERROR", f"Invalid status '{publish_status}'.", 422)

    org = SponsorPartner(
        kind=kind,
        name=str(overrides.get("name") or inquiry.organization_name).strip()[:160],
        slug=_ensure_unique_slug(str(overrides.get("name") or inquiry.organization_name)),
        tier_or_category=tier_code,
        competition_id=inquiry.competition_id,
        badge_label=(str(overrides.get("badge_label") or "").strip()[:120] or None),
        tagline=(str(overrides.get("tagline") or "").strip()[:255] or f"Official StageLight Ghana {'Sponsor' if kind == 'SPONSOR' else 'Partner'}"),
        description=(str(overrides.get("description") or "").strip() or inquiry.goals_message),
        contribution_summary=(str(overrides.get("contribution_summary") or "").strip()[:255] or None),
        highlights_json=normalize_highlights(overrides.get("highlights")),
        website_url=inquiry.website_url,
        accent_color=validate_accent_color(overrides.get("accent_color"), kind=kind),
        location=inquiry.location,
        since_year=utcnow().year,
        contact_name=inquiry.contact_name,
        contact_email=inquiry.contact_email,
        contact_phone=inquiry.contact_phone,
        internal_notes=f"Promoted from inquiry {inquiry.reference_no}."
        + (f" Budget/Model: {inquiry.budget_range}." if inquiry.budget_range else ""),
        is_featured=bool(overrides.get("is_featured", False)),
        sort_order=100,
        status=publish_status,
        created_by=actor.id,
    )
    db.session.add(org)
    db.session.flush()

    inquiry.status = "APPROVED"
    inquiry.converted_org_id = org.id
    inquiry.reviewed_by = actor.id
    inquiry.reviewed_at = utcnow()
    if overrides.get("admin_notes"):
        inquiry.admin_notes = str(overrides["admin_notes"]).strip()

    log_audit(
        actor_user_id=actor.id,
        action="PARTNERSHIP_INQUIRY_CONVERTED",
        entity_type="partnership_inquiry",
        entity_id=inquiry.id,
        after={
            "reference_no": inquiry.reference_no,
            "created_org_id": org.id,
            "created_org_slug": org.slug,
            "kind": org.kind,
            "status": org.status,
        },
    )
    db.session.commit()
    return org


def get_taxonomy_payload() -> dict:
    return {
        "sponsor_tiers": SPONSOR_TIER_LIST,
        "partner_categories": PARTNER_CATEGORY_LIST,
        "org_statuses": ["ACTIVE", "DRAFT", "ARCHIVED"],
        "inquiry_statuses": ["NEW", "UNDER_REVIEW", "CONTACTED", "APPROVED", "DECLINED"],
    }
