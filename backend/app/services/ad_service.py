from app.extensions import db
from app.models.operations import PlatformSetting
from app.models.partnership import (
    PARTNER_CATEGORIES,
    SPONSOR_TIERS,
    SponsorPartner,
    resolve_tier_or_category_meta,
)

DEFAULT_AD_SETTINGS = {
    "ads_enabled": True,
    "google_ads_enabled": True,
    "google_ads_client_id": "ca-pub-6412959828302194",
    "google_ads_slots": {
        "home_leaderboard": "4892019283",
        "home_mid": "7193028491",
        "nominees_top": "1003003003",
        "nominee_profile": "1004004004",
        "voting_page": "1005005005",
        "results_page": "1006006006",
        "sidebar": "9382019482",
    },
    "partner_ads_enabled": True,
    "partner_ads_rotation_seconds": 6,
    "ad_banner_style": "hybrid",  # "hybrid", "partner_only", "google_only"
    "custom_partner_headline": "Proudly Supported by Leading Ghanaian Brands",
    "ad_disclosure_text": "Sponsored Advertisement",
}


def get_ad_settings() -> dict:
    """Retrieve platform ad settings with safe defaults."""
    setting = PlatformSetting.query.filter_by(key="ad_settings").first()
    if not setting or not isinstance(setting.value_json, dict):
        return dict(DEFAULT_AD_SETTINGS)
    merged = dict(DEFAULT_AD_SETTINGS)
    merged.update(setting.value_json)
    if "google_ads_slots" in setting.value_json and isinstance(setting.value_json["google_ads_slots"], dict):
        slots = dict(DEFAULT_AD_SETTINGS["google_ads_slots"])
        slots.update(setting.value_json["google_ads_slots"])
        merged["google_ads_slots"] = slots
    return merged


def get_partner_adverts(limit: int = 15) -> list[dict]:
    """Build rich advertisement creatives from active sponsors and partners."""
    orgs = (
        SponsorPartner.query.filter_by(status="ACTIVE")
        .order_by(SponsorPartner.is_featured.desc(), SponsorPartner.sort_order.asc())
        .limit(limit)
        .all()
    )

    ads = []
    for org in orgs:
        meta = resolve_tier_or_category_meta(org.kind, org.tier_or_category)
        profile_prefix = "/sponsors" if org.kind == "SPONSOR" else "/partners"
        badge = org.badge_label or meta.get("badge_title") or meta.get("label") or ("Official Sponsor" if org.kind == "SPONSOR" else "Official Partner")

        cta_label = "Visit Official Partner"
        if org.kind == "SPONSOR":
            cta_label = "Explore Sponsor" if org.tier_or_category in ("TITLE", "PLATINUM") else "Learn More"

        tagline = org.tagline or org.contribution_summary or f"Empowering Ghanaian talent across all 16 regions with {org.name}."
        description = org.description or org.contribution_summary or f"{org.name} is an official supporter of StageLight Ghana 2026."

        ads.append(
            {
                "id": f"ad-{org.id}",
                "org_id": org.id,
                "name": org.name,
                "slug": org.slug,
                "kind": org.kind,
                "kind_label": "Official Sponsor" if org.kind == "SPONSOR" else "Official Ecosystem Partner",
                "tier_or_category": org.tier_or_category,
                "tier_or_category_label": meta.get("label"),
                "tier_rank": meta.get("rank", 99),
                "badge_label": badge,
                "tagline": tagline,
                "description": description,
                "cta_label": cta_label,
                "website_url": org.website_url,
                "profile_path": f"{profile_prefix}/{org.slug}",
                "target_url": org.website_url or f"{profile_prefix}/{org.slug}",
                "logo_url": org.resolved_logo_url,
                "brand_initials": org.computed_initials,
                "accent_color": org.accent_color or "#d97706",
                "location": org.location or "Accra, Ghana",
                "is_featured": org.is_featured,
            }
        )

    return ads
