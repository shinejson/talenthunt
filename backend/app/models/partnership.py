from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

ORG_KINDS = {"SPONSOR", "PARTNER"}
ORG_STATUSES = {"DRAFT", "ACTIVE", "ARCHIVED"}
INQUIRY_STATUSES = {"NEW", "UNDER_REVIEW", "CONTACTED", "APPROVED", "DECLINED"}

SPONSOR_TIER_LIST = [
    {
        "code": "TITLE",
        "label": "Title Sponsor",
        "plural_label": "Title Sponsor",
        "rank": 1,
        "description": "Exclusive headline naming rights, Grand Prize presentation, and nationwide broadcast integration.",
    },
    {
        "code": "PLATINUM",
        "label": "Platinum Sponsor",
        "plural_label": "Platinum Sponsors",
        "rank": 2,
        "description": "Co-presenting brand visibility across live showcases, livestreams, and digital voting journeys.",
    },
    {
        "code": "GOLD",
        "label": "Gold Sponsor",
        "plural_label": "Gold Sponsors",
        "rank": 3,
        "description": "Major round and category sponsorship with regional audition tour activations across Ghana.",
    },
    {
        "code": "SILVER",
        "label": "Silver Sponsor",
        "plural_label": "Silver Sponsors",
        "rank": 4,
        "description": "Official competition supplier and showcase supporter across stage, wardrobe, and nominee experience.",
    },
    {
        "code": "SUPPORTING",
        "label": "Supporting Sponsor",
        "plural_label": "Supporting & Regional Sponsors",
        "rank": 5,
        "description": "Regional and community brand champions backing grassroots talent discovery and nominee welfare.",
    },
]

SPONSOR_TIERS = {item["code"]: item for item in SPONSOR_TIER_LIST}

PARTNER_CATEGORY_LIST = [
    {
        "code": "PAYMENT_FINTECH",
        "label": "Payment & Fintech",
        "badge_title": "Payment & Fintech Partner",
        "rank": 1,
        "icon": "credit-card",
        "description": "Verified Mobile Money, card settlement, cryptographic webhook delivery, and automated vote reconciliation.",
    },
    {
        "code": "BROADCAST_MEDIA",
        "label": "Broadcast & Media",
        "badge_title": "Broadcast & Media Partner",
        "rank": 2,
        "icon": "radio",
        "description": "Nationwide television, FM radio, digital streaming, and press amplification for nominated artists.",
    },
    {
        "code": "STUDIO_PRODUCTION",
        "label": "Studio & Production",
        "badge_title": "Studio & Production Partner",
        "rank": 3,
        "icon": "mic",
        "description": "Recording studio sessions, live stage sound engineering, creative direction, and artist bootcamps.",
    },
    {
        "code": "VENUE_HOSPITALITY",
        "label": "Venue & Hospitality",
        "badge_title": "Venue & Hospitality Partner",
        "rank": 4,
        "icon": "building",
        "description": "Concert arenas, regional audition halls, rehearsal residencies, and contestant accommodation.",
    },
    {
        "code": "TELECOM_TECH",
        "label": "Telecom & Technology",
        "badge_title": "Telecom & Technology Partner",
        "rank": 5,
        "icon": "globe",
        "description": "Cloud media delivery, cybersecurity, integrity auditing, and high-speed venue connectivity.",
    },
    {
        "code": "COMMUNITY_YOUTH",
        "label": "Community & Youth",
        "badge_title": "Community & Youth Partner",
        "rank": 6,
        "icon": "users",
        "description": "Grassroots talent scouting, campus creative hubs, cultural councils, and youth mentorship across all 16 regions.",
    },
]

PARTNER_CATEGORIES = {item["code"]: item for item in PARTNER_CATEGORY_LIST}

DEFAULT_SPONSORSHIP_PACKAGES = [
    {
        "tier": "TITLE",
        "name": "Title Sponsor",
        "investment": "GHS 250,000+ / Season",
        "availability": "1 Exclusive Slot",
        "is_featured": True,
        "summary": "Own the main stage with headline naming rights, Grand Finale trophy presentation, and lockup branding across every broadcast and verified vote receipt.",
        "benefits": [
            "\"Presented by\" lockup across homepage, voting pages, and live TV",
            "On-stage presentation of the GHS 100,000 Championship Crown",
            "Co-branded messaging on digital vote confirmation receipts",
            "Dedicated regional audition fan zones across Accra, Kumasi & Tamale",
            "20 VIP hospitality passes & executive keynote at the Grand Finale",
        ],
    },
    {
        "tier": "PLATINUM",
        "name": "Platinum Sponsor",
        "investment": "GHS 120,000 – GHS 240,000",
        "availability": "Up to 2 Slots",
        "is_featured": False,
        "summary": "High-impact co-presenting partnership spanning livestream broadcasts, Quarterfinal showcases, and contestant mentorship spotlights.",
        "benefits": [
            "Co-presenting credits on all livestreamed rounds & audition reels",
            "Exclusive sponsorship of a national competition round",
            "Featured brand profile & homepage showcase placement",
            "Custom product integration inside nominee bootcamp episodes",
            "12 VIP Grand Finale passes & red-carpet media wall presence",
        ],
    },
    {
        "tier": "GOLD",
        "name": "Gold Sponsor",
        "investment": "GHS 50,000 – GHS 115,000",
        "availability": "Up to 4 Slots",
        "is_featured": False,
        "summary": "Ideal for national consumer brands seeking category ownership, campus engagement, and authentic youth storytelling across Ghana.",
        "benefits": [
            "Official naming sponsorship of one performance category",
            "Brand activation booths at regional audition stops",
            "Social media spotlight series with category finalists",
            "Logo placement across stage backdrops & official sponsors page",
            "8 VIP Grand Finale tickets & post-season impact report",
        ],
    },
    {
        "tier": "SILVER",
        "name": "Silver & Supporting",
        "investment": "GHS 15,000 – GHS 45,000 or In-Kind",
        "availability": "Open Year-Round",
        "is_featured": False,
        "summary": "Flexible cash or value-in-kind sponsorship for wardrobe, travel, hospitality, grooming, energy, and regional special prizes.",
        "benefits": [
            "Official Category Supplier or Special Award presenter status",
            "Direct product placement with shortlisted nominees & hosts",
            "Dedicated profile on the StageLight Sponsors directory",
            "Regional press recognition & backstage brand showcase",
            "4 VIP passes to Quarterfinal and Grand Finale live shows",
        ],
    },
]

DEFAULT_COLLABORATION_TRACKS = [
    {
        "category": "BROADCAST_MEDIA",
        "title": "Broadcast, Radio & Digital Media",
        "icon": "radio",
        "summary": "Co-produce audition diaries, host live nominee interviews, stream Quarterfinal nights, and syndicate verified results nationwide.",
        "deliverables": ["Exclusive backstage & winner press access", "Live leaderboard & QR voting screen feeds", "Cross-channel co-branded promos"],
    },
    {
        "category": "PAYMENT_FINTECH",
        "title": "Fintech, Payments & Trust Infrastructure",
        "icon": "credit-card",
        "summary": "Connect regulated Mobile Money, card, USSD, or independent audit tooling to power seamless, tamper-evident public voting.",
        "deliverables": ["HMAC-verified webhook & ledger integration", "Transparent reconciliation & zero-fraud standards", "High-volume finale checkout visibility"],
    },
    {
        "category": "STUDIO_PRODUCTION",
        "title": "Recording Studios, Labels & Production",
        "icon": "mic",
        "summary": "Turn stage victories into lasting careers through studio recording time, mixing & mastering, choreography direction, and live sound.",
        "deliverables": ["First-look access to vetted emerging talent", "Credited production on finalist showcase EPs", "Judge & mentor panel representation"],
    },
    {
        "category": "COMMUNITY_YOUTH",
        "title": "Venues, Campuses & Youth Arts Hubs",
        "icon": "users",
        "summary": "Host regional audition clinics, live showcases, campus pop-ups, and digital upload booths across all 16 regions of Ghana.",
        "deliverables": ["Official regional scouting hub accreditation", "Priority wildcard audition workshops", "Year-round community arts recognition"],
    },
]


def resolve_tier_or_category_meta(kind: str, code: str) -> dict:
    if kind == "SPONSOR":
        return SPONSOR_TIERS.get(code, {"code": code, "label": code.replace("_", " ").title(), "rank": 99})
    return PARTNER_CATEGORIES.get(
        code,
        {"code": code, "label": code.replace("_", " ").title(), "badge_title": code.replace("_", " ").title(), "rank": 99, "icon": "globe"},
    )


class SponsorPartner(db.Model):
    __tablename__ = "sponsors_partners"
    __table_args__ = (
        db.Index("ix_sponsors_partners_kind_status", "kind", "status"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    kind = db.Column(db.String(20), nullable=False, index=True)  # SPONSOR, PARTNER
    name = db.Column(db.String(160), nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    tier_or_category = db.Column(db.String(40), nullable=False, index=True)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="SET NULL"), nullable=True, index=True)
    badge_label = db.Column(db.String(120), nullable=True)
    tagline = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    contribution_summary = db.Column(db.String(255), nullable=True)
    highlights_json = db.Column(db.JSON, nullable=False, default=list)
    quote_text = db.Column(db.Text, nullable=True)
    quote_author = db.Column(db.String(160), nullable=True)
    website_url = db.Column(db.String(500), nullable=True)
    logo_url = db.Column(db.String(500), nullable=True)
    logo_asset_id = db.Column(db.String(36), db.ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True)
    brand_initials = db.Column(db.String(6), nullable=True)
    accent_color = db.Column(db.String(16), nullable=False, default="#d97706")
    location = db.Column(db.String(150), nullable=True)
    since_year = db.Column(db.Integer, nullable=True)
    contact_name = db.Column(db.String(150), nullable=True)
    contact_email = db.Column(db.String(255), nullable=True)
    contact_phone = db.Column(db.String(40), nullable=True)
    internal_notes = db.Column(db.Text, nullable=True)
    is_featured = db.Column(db.Boolean, nullable=False, default=False, index=True)
    sort_order = db.Column(db.Integer, nullable=False, default=100)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE", index=True)  # DRAFT, ACTIVE, ARCHIVED
    created_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    competition = db.relationship("Competition", lazy="joined")
    logo_asset = db.relationship("MediaAsset", lazy="joined")

    @property
    def resolved_logo_url(self) -> str | None:
        if self.logo_asset and self.logo_asset.scan_status == "CLEAN":
            return f"/uploads/{self.logo_asset.storage_key}"
        return self.logo_url or None

    @property
    def computed_initials(self) -> str:
        if self.brand_initials and self.brand_initials.strip():
            return self.brand_initials.strip().upper()[:4]
        parts = [p for p in (self.name or "").strip().split() if p]
        if not parts:
            return "SL"
        if len(parts) == 1:
            return parts[0][:3].upper()
        return "".join(p[0] for p in parts[:3]).upper()

    def to_public_dict(self) -> dict:
        meta = resolve_tier_or_category_meta(self.kind, self.tier_or_category)
        profile_prefix = "/sponsors" if self.kind == "SPONSOR" else "/partners"
        comp = self.competition
        has_public_comp = bool(comp and comp.status not in ("DRAFT", "ARCHIVED"))
        return {
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "slug": self.slug,
            "profile_path": f"{profile_prefix}/{self.slug}",
            "tier_or_category": self.tier_or_category,
            "tier_or_category_label": meta.get("label"),
            "tier_rank": meta.get("rank", 99),
            "category_icon": meta.get("icon"),
            "competition_id": self.competition_id if has_public_comp else None,
            "competition_title": comp.title if has_public_comp else None,
            "competition_slug": comp.slug if has_public_comp else None,
            "scope_label": comp.title if has_public_comp else "Official Platform-Wide",
            "badge_label": self.badge_label or meta.get("badge_title") or meta.get("label"),
            "tagline": self.tagline,
            "description": self.description,
            "contribution_summary": self.contribution_summary,
            "highlights": list(self.highlights_json or []),
            "quote_text": self.quote_text,
            "quote_author": self.quote_author,
            "website_url": self.website_url,
            "logo_url": self.resolved_logo_url,
            "brand_initials": self.computed_initials,
            "accent_color": self.accent_color or "#d97706",
            "location": self.location,
            "since_year": self.since_year,
            "is_featured": self.is_featured,
            "sort_order": self.sort_order,
            "status": self.status,
        }

    def to_admin_dict(self) -> dict:
        data = self.to_public_dict()
        data.update(
            {
                "competition_id": self.competition_id,
                "competition_title": self.competition.title if self.competition else None,
                "competition_slug": self.competition.slug if self.competition else None,
                "raw_logo_url": self.logo_url,
                "logo_asset_id": self.logo_asset_id,
                "logo_asset": self.logo_asset.to_dict() if self.logo_asset else None,
                "raw_brand_initials": self.brand_initials,
                "contact_name": self.contact_name,
                "contact_email": self.contact_email,
                "contact_phone": self.contact_phone,
                "internal_notes": self.internal_notes,
                "created_by": self.created_by,
                "created_at": iso_utc(self.created_at),
                "updated_at": iso_utc(self.updated_at),
            }
        )
        return data


class PartnershipInquiry(db.Model):
    __tablename__ = "partnership_inquiries"
    __table_args__ = (
        db.Index("ix_partnership_inquiries_type_status", "inquiry_type", "status"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    reference_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    inquiry_type = db.Column(db.String(20), nullable=False, index=True)  # SPONSOR, PARTNER
    organization_name = db.Column(db.String(160), nullable=False)
    contact_name = db.Column(db.String(150), nullable=False)
    contact_role = db.Column(db.String(120), nullable=True)
    contact_email = db.Column(db.String(255), nullable=False)
    contact_phone = db.Column(db.String(40), nullable=True)
    website_url = db.Column(db.String(500), nullable=True)
    location = db.Column(db.String(150), nullable=True)
    desired_tier_or_category = db.Column(db.String(40), nullable=True)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="SET NULL"), nullable=True, index=True)
    budget_range = db.Column(db.String(100), nullable=True)
    goals_message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(30), nullable=False, default="NEW", index=True)  # NEW, UNDER_REVIEW, CONTACTED, APPROVED, DECLINED
    admin_notes = db.Column(db.Text, nullable=True)
    converted_org_id = db.Column(db.String(36), db.ForeignKey("sponsors_partners.id", ondelete="SET NULL"), nullable=True)
    reviewed_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    competition = db.relationship("Competition", lazy="joined")
    converted_org = db.relationship("SponsorPartner", lazy="joined")
    reviewer = db.relationship("User", lazy="joined")

    def to_public_dict(self) -> dict:
        meta = (
            resolve_tier_or_category_meta(self.inquiry_type, self.desired_tier_or_category)
            if self.desired_tier_or_category
            else {}
        )
        return {
            "reference_no": self.reference_no,
            "inquiry_type": self.inquiry_type,
            "organization_name": self.organization_name,
            "desired_tier_or_category": self.desired_tier_or_category,
            "desired_label": meta.get("label"),
            "status": self.status,
            "created_at": iso_utc(self.created_at),
        }

    def to_admin_dict(self) -> dict:
        meta = (
            resolve_tier_or_category_meta(self.inquiry_type, self.desired_tier_or_category)
            if self.desired_tier_or_category
            else {}
        )
        return {
            "id": self.id,
            "reference_no": self.reference_no,
            "inquiry_type": self.inquiry_type,
            "organization_name": self.organization_name,
            "contact_name": self.contact_name,
            "contact_role": self.contact_role,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "website_url": self.website_url,
            "location": self.location,
            "desired_tier_or_category": self.desired_tier_or_category,
            "desired_label": meta.get("label") or self.desired_tier_or_category,
            "competition_id": self.competition_id,
            "competition_title": self.competition.title if self.competition else "Platform-Wide / General",
            "budget_range": self.budget_range,
            "goals_message": self.goals_message,
            "status": self.status,
            "admin_notes": self.admin_notes,
            "converted_org_id": self.converted_org_id,
            "converted_org_slug": self.converted_org.slug if self.converted_org else None,
            "converted_org_name": self.converted_org.name if self.converted_org else None,
            "reviewed_by": self.reviewed_by,
            "reviewer_name": self.reviewer.full_name if self.reviewer else None,
            "reviewed_at": iso_utc(self.reviewed_at),
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
        }
