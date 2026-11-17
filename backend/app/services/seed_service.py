from datetime import timedelta

from app.extensions import db
from app.integrations.payments.mock_adapter import register_settled_mock_tx
from app.models.application import Application, Review, Submission
from app.models.competition import Category, Competition, Round, VotePackage
from app.models.elimination import EliminationResult, EliminationRun
from app.models.nominee import Nominee, RoundEntry
from app.models.operations import PlatformSetting
from app.models.partnership import PartnershipInquiry, SponsorPartner
from app.models.user import User
from app.models.voting import Order, Payment, VoteLedger
from app.services.auth_service import ensure_roles_exist, grant_role
from app.services.notification_service import notify_user
from app.utils.security import generate_opaque_slug, generate_reference, hash_password
from app.utils.time_utils import utcnow


def seed_demo_data_if_empty():
    ensure_roles_exist()
    if User.query.first() is not None:
        seed_sponsors_partners_if_empty()
        seed_payouts_if_empty()
        return

    now = utcnow()

    # 1. Create role-based accounts
    admin = User(
        full_name="Akosua Mensah (Super Admin)",
        email="admin@stagelight.gh",
        phone="+233240000001",
        password_hash=hash_password("Admin@2026!"),
        is_verified=True,
        location="Accra, Greater Accra",
        status="ACTIVE",
    )
    manager = User(
        full_name="Kofi Owusu (Competition Manager)",
        email="manager@stagelight.gh",
        phone="+233240000002",
        password_hash=hash_password("Manager@2026!"),
        is_verified=True,
        location="Accra, Greater Accra",
        status="ACTIVE",
    )
    reviewer = User(
        full_name="Nana Ama Boateng (Judge)",
        email="judge@stagelight.gh",
        phone="+233240000003",
        password_hash=hash_password("Judge@2026!"),
        is_verified=True,
        location="Kumasi, Ashanti",
        status="ACTIVE",
    )
    finance = User(
        full_name="Yaw Asante (Finance Officer)",
        email="finance@stagelight.gh",
        phone="+233240000004",
        password_hash=hash_password("Finance@2026!"),
        is_verified=True,
        location="Accra, Greater Accra",
        status="ACTIVE",
    )
    moderator = User(
        full_name="Efua Darko (Moderator)",
        email="moderator@stagelight.gh",
        phone="+233240000005",
        password_hash=hash_password("Moderator@2026!"),
        is_verified=True,
        location="Tema, Greater Accra",
        status="ACTIVE",
    )

    db.session.add_all([admin, manager, reviewer, finance, moderator])
    db.session.flush()

    grant_role(admin, "SUPER_ADMIN")
    grant_role(manager, "COMPETITION_MANAGER")
    grant_role(reviewer, "REVIEWER")
    grant_role(finance, "FINANCE_OFFICER")
    grant_role(moderator, "MODERATOR")

    # 2. Active Ghana-first Competition
    comp = Competition(
        title="StageLight Ghana Talent Hunt 2026",
        slug="stagelight-ghana-2026",
        tagline="Discovering Ghana's brightest voices, dancers, poets, and live performers.",
        description=(
            "StageLight Ghana 2026 brings together emerging performers from all 16 regions of Ghana. "
            "Submit your original demo, earn official nomination from our judging panel, share your "
            "unique voting link, and advance through transparent, ledger-verified public voting rounds."
        ),
        status="APPLICATIONS_OPEN",
        applications_open_at=now - timedelta(days=20),
        applications_close_at=now + timedelta(days=25),
        starts_at=now - timedelta(days=20),
        ends_at=now + timedelta(days=45),
        timezone="Africa/Accra",
        currency="GHS",
        prize_summary="GHS 100,000 Cash + Full 6-Track Studio EP + 4-City National Tour + 24K Gold Champion Trophy + Brand Ambassadorship",
        rules=(
            "1. DEMO & ORIGINALITY: All audition entries must be original performances created and executed by the applicant. Cover acts must credit original creators. Plagiarism or AI-generated deepfakes result in permanent disqualification.\n"
            "2. PRIZE ARCHITECTURE: 1st Place Champion receives GHS 100,000 Cash + 6-Track Studio EP + National Headline Tour + 24K Gold Trophy + Brand Ambassadorship; 2nd Place receives GHS 40,000 Cash + 2-Track Single + Wardrobe Package; 3rd Place receives GHS 20,000 Cash + 1-Track Single. Round 1 Winner receives GHS 5,000 Bursary + Fiber Kit; Round 2 Winner receives GHS 10,000 Bursary + Residency.\n"
            "3. PROGRESSION & TIE-BREAKING: Progression follows strict published Top-N rules per round. Ties are broken in order: 1) Panel Judge Blind Score, 2) Earliest verified qualifying vote timestamp on the immutable ledger, 3) Head-to-head panel consensus.\n"
            "4. VERIFIED VOTING INTEGRITY: Votes are priced at GHS 1.00 per vote and are credited strictly upon cryptographic HMAC-verified webhook confirmation. Mismatched or fraudulent payments produce zero votes. Vote ledger is immutable and append-only.\n"
            "5. MINOR PROTECTION & GOVERNANCE: Performers aged 15-17 require verifiable Parent/Guardian written consent. Anti-fraud limit of 2,000 votes/day per contact enforced. Zero tolerance for bribery, harassment, or botting."
        ),
        eligibility="Open to solo performers, duets, and groups legally resident in Ghana aged 15 and above across all 16 administrative regions (guardian consent required for applicants aged 15–17).",
        public_leaderboard=True,
        nominee_see_rank=True,
        voting_paused=False,
        allow_custom_quantity=True,
        unit_vote_price_minor=100,  # GHS 1.00
        min_vote_quantity=1,
        max_vote_quantity_per_order=500,
        max_votes_per_day_per_contact=2000,
        require_guardian_for_minors=True,
    )
    db.session.add(comp)
    db.session.flush()

    # 3. Categories
    cat_music = Category(
        competition_id=comp.id,
        name="Afrobeats & Highlife Vocals",
        slug="vocals-music",
        description="Live vocalists, songwriters, Highlife, Gospel, and Afrobeats performers.",
        icon="music",
    )
    cat_dance = Category(
        competition_id=comp.id,
        name="Afro-Dance & Choreography",
        slug="afro-dance",
        description="Azonto, Afro-fusion, traditional Ghanaian dance, and street choreography.",
        icon="zap",
    )
    cat_spoken = Category(
        competition_id=comp.id,
        name="Spoken Word & Rap",
        slug="spoken-word-rap",
        description="Poetry, lyrical storytelling, Hiplife bars, and spoken word artistry.",
        icon="mic",
    )
    cat_comedy = Category(
        competition_id=comp.id,
        name="Stand-Up Comedy & Theatre",
        slug="comedy-theatre",
        description="Live comedy routines, dramatic monologues, and stage storytelling.",
        icon="smile",
    )
    db.session.add_all([cat_music, cat_dance, cat_spoken, cat_comedy])
    db.session.flush()

    # 4. Rounds (Round 1 Finalized, Round 2 Open Now, Round 3 Grand Finale Scheduled)
    round1 = Round(
        competition_id=comp.id,
        name="Round 1 — Regional Audition Showcase",
        sequence_no=1,
        description="Opening public showcase where top 4 contestants advance to the Quarterfinals.",
        status="FINALIZED",
        voting_opens_at=now - timedelta(days=14),
        voting_closes_at=now - timedelta(days=5),
        elimination_config={
            "method": "top_n",
            "advance_count": 4,
            "tie_breakers": ["judge_score_desc", "earliest_qualifying_vote_timestamp"],
            "exclude_disqualified": True,
            "publish_rankings": True,
            "pending_payment_grace_minutes": 30,
        },
        is_finale=False,
        results_published=True,
    )
    round2 = Round(
        competition_id=comp.id,
        name="Round 2 — National Quarterfinals",
        sequence_no=2,
        description="Live voting round! Top 3 nominees advance to the StageLight Grand Finale.",
        status="OPEN",
        voting_opens_at=now - timedelta(days=4),
        voting_closes_at=now + timedelta(days=14),
        elimination_config={
            "method": "top_n",
            "advance_count": 3,
            "tie_breakers": ["judge_score_desc", "earliest_qualifying_vote_timestamp"],
            "exclude_disqualified": True,
            "publish_rankings": True,
            "pending_payment_grace_minutes": 30,
        },
        is_finale=False,
        results_published=False,
    )
    round3 = Round(
        competition_id=comp.id,
        name="Round 3 — Grand Finale",
        sequence_no=3,
        description="Final championship vote to crown the StageLight Ghana 2026 Winner.",
        status="SCHEDULED",
        voting_opens_at=now + timedelta(days=16),
        voting_closes_at=now + timedelta(days=30),
        elimination_config={
            "method": "top_n",
            "advance_count": 1,
            "tie_breakers": ["judge_score_desc", "earliest_qualifying_vote_timestamp"],
            "exclude_disqualified": True,
            "publish_rankings": True,
            "pending_payment_grace_minutes": 30,
        },
        is_finale=True,
        results_published=False,
    )
    db.session.add_all([round1, round2, round3])
    db.session.flush()

    # 5. Vote Packages (GHS minor units: 100 pesewas = GHS 1.00)
    packages = [
        VotePackage(competition_id=comp.id, name="Single Cheer", description="Cast 1 verified vote", vote_quantity=1, price_minor=100, currency="GHS", sort_order=1),
        VotePackage(competition_id=comp.id, name="Supporter Pack", description="5 verified votes", vote_quantity=5, price_minor=500, currency="GHS", sort_order=2),
        VotePackage(competition_id=comp.id, name="Fan Boost", description="15 verified votes — Most Popular", vote_quantity=15, price_minor=1500, currency="GHS", is_featured=True, sort_order=3),
        VotePackage(competition_id=comp.id, name="Stage Champion", description="50 verified votes", vote_quantity=50, price_minor=5000, currency="GHS", sort_order=4),
        VotePackage(competition_id=comp.id, name="Mega Patron", description="120 verified votes", vote_quantity=120, price_minor=12000, currency="GHS", sort_order=5),
    ]
    db.session.add_all(packages)
    db.session.flush()

    # 6. Contestants (5 in Round 1 -> 4 qualified to Round 2, 1 eliminated in Round 1)
    contestant_specs = [
        {
            "full_name": "Ama Serwaa",
            "stage_name": "Ama Gold",
            "email": "ama@stagelight.gh",
            "phone": "+233241110001",
            "location": "Osu, Accra",
            "cat": cat_music,
            "title": "Golden Highlife Sunrise (Live Acoustic Session)",
            "desc": "An original acoustic Highlife fusion blending palm-wine guitar rhythms with contemporary soul vocals.",
            "video": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "score": 92.5,
            "r1_votes": 145,
            "r2_votes": [50, 50, 15, 15],
            "featured": True,
            "qualified_r2": True,
        },
        {
            "full_name": "Kwesi Tetteh",
            "stage_name": "Kwesi Motion",
            "email": "kwesi@stagelight.gh",
            "phone": "+233241110002",
            "location": "Tema Community 8",
            "cat": cat_dance,
            "title": "Labadi Pulse — Afro-Street Choreography",
            "desc": "High-energy Azonto and Afro-fusion storytelling routine choreographed to live talking drums.",
            "video": "https://www.youtube.com/watch?v=9bZkp7q19f0",
            "score": 89.0,
            "r1_votes": 120,
            "r2_votes": [50, 50, 5],
            "featured": True,
            "qualified_r2": True,
        },
        {
            "full_name": "Esi Nyarko",
            "stage_name": "Poetess Esi",
            "email": "esi@stagelight.gh",
            "phone": "+233241110003",
            "location": "Cape Coast, Central",
            "cat": cat_spoken,
            "title": "Letters from Elmina Coast (Spoken Word)",
            "desc": "Bilingual English and Fante spoken word piece celebrating resilience, youth creativity, and heritage.",
            "video": "https://vimeo.com/76979871",
            "score": 90.0,
            "r1_votes": 98,
            "r2_votes": [50, 15, 15, 5],
            "featured": True,
            "qualified_r2": True,
        },
        {
            "full_name": "Ibrahim Sulemana",
            "stage_name": "King Zongo Bars",
            "email": "ibrahim@stagelight.gh",
            "phone": "+233241110004",
            "location": "Tamale, Northern",
            "cat": cat_spoken,
            "title": "Savannah Cypher Live",
            "desc": "Rapid-fire Dagbani and English lyrical storytelling accompanied by traditional gonje strings.",
            "video": "https://soundcloud.com/discover",
            "score": 86.5,
            "r1_votes": 82,
            "r2_votes": [50, 15],
            "featured": True,
            "qualified_r2": True,
        },
        {
            "full_name": "Kojo Boadu",
            "stage_name": "Kojo Laughs",
            "email": "kojo@stagelight.gh",
            "phone": "+233241110005",
            "location": "Takoradi, Western",
            "cat": cat_comedy,
            "title": "Trotro Chronicles — 5 Minute Stand-Up",
            "desc": "Clean observational stand-up comedy about morning Accra-Takoradi commuter adventures.",
            "video": "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
            "score": 81.0,
            "r1_votes": 35,
            "r2_votes": [],
            "featured": False,
            "qualified_r2": False,
        },
    ]

    elim_run_r1 = EliminationRun(
        round_id=round1.id,
        method="top_n",
        rules_snapshot=round1.elimination_config,
        status="FINALIZED",
        notes="Official Round 1 Audition Showcase results confirmed by Competition Manager.",
        executed_by=manager.id,
        executed_at=now - timedelta(days=5),
    )
    db.session.add(elim_run_r1)
    db.session.flush()

    for idx, spec in enumerate(contestant_specs, start=1):
        u = User(
            full_name=spec["full_name"],
            email=spec["email"],
            phone=spec["phone"],
            password_hash=hash_password("Nominee@2026!"),
            is_verified=True,
            location=spec["location"],
            bio=spec["desc"],
            status="ACTIVE",
        )
        db.session.add(u)
        db.session.flush()
        grant_role(u, "APPLICANT")
        grant_role(u, "NOMINEE", granted_by=manager.id)

        app_rec = Application(
            user_id=u.id,
            competition_id=comp.id,
            category_id=spec["cat"].id,
            reference_no=f"APP-2026-SEED0{idx}",
            stage_name=spec["stage_name"],
            contact_email=u.email,
            contact_phone=u.phone,
            location=u.location,
            status="NOMINATED",
            applicant_feedback="Outstanding audition! Approved and nominated.",
            decision_by=manager.id,
            decision_at=now - timedelta(days=15),
            decision_reason="Strong originality and stage presence.",
            submitted_at=now - timedelta(days=17),
        )
        db.session.add(app_rec)
        db.session.flush()

        sub = Submission(
            application_id=app_rec.id,
            version_no=1,
            title=spec["title"],
            description=spec["desc"],
            biography=spec["desc"],
            external_video_url=spec["video"],
            consent_accepted=True,
            rights_declaration=True,
        )
        rev = Review(
            application_id=app_rec.id,
            reviewer_user_id=reviewer.id,
            score=spec["score"],
            recommendation="NOMINATE",
            internal_notes="Verified live vocals/performance; clear camera framing.",
        )
        db.session.add_all([sub, rev])

        nom_slug = f"{spec['stage_name'].lower().replace(' ', '-')}-{generate_opaque_slug(5)}"
        nominee = Nominee(
            application_id=app_rec.id,
            user_id=u.id,
            competition_id=comp.id,
            category_id=spec["cat"].id,
            public_name=spec["stage_name"],
            public_slug=nom_slug,
            tagline=spec["title"],
            profile_text=spec["desc"],
            location=spec["location"],
            social_links={"instagram": f"@{spec['stage_name'].lower().replace(' ', '')}"},
            status="ACTIVE" if spec["qualified_r2"] else "ELIMINATED",
            is_featured=spec["featured"],
            nominated_at=now - timedelta(days=15),
        )
        db.session.add(nominee)
        db.session.flush()

        # Round 1 entry + ledger credit
        r1_entry = RoundEntry(
            round_id=round1.id,
            nominee_id=nominee.id,
            voting_slug=generate_opaque_slug(11),
            link_enabled=True,
            status="QUALIFIED" if spec["qualified_r2"] else "ELIMINATED",
            judge_score=spec["score"],
            starting_total_snapshot=0,
            final_total_snapshot=spec["r1_votes"],
        )
        db.session.add(r1_entry)
        db.session.flush()

        _seed_paid_vote_bundle(
            nominee=nominee,
            round_obj=round1,
            entry=r1_entry,
            vote_qty=spec["r1_votes"],
            created_at=now - timedelta(days=8),
        )

        r2_entry = None
        if spec["qualified_r2"]:
            r2_entry = RoundEntry(
                round_id=round2.id,
                nominee_id=nominee.id,
                voting_slug=generate_opaque_slug(11),
                link_enabled=True,
                status="ACTIVE",
                judge_score=spec["score"],
                starting_total_snapshot=0,
            )
            db.session.add(r2_entry)
            db.session.flush()

            for day_offset, qty in enumerate(spec["r2_votes"]):
                _seed_paid_vote_bundle(
                    nominee=nominee,
                    round_obj=round2,
                    entry=r2_entry,
                    vote_qty=qty,
                    created_at=now - timedelta(days=max(0, 3 - day_offset), hours=day_offset * 2),
                )

        db.session.add(
            EliminationResult(
                elimination_run_id=elim_run_r1.id,
                nominee_id=nominee.id,
                round_entry_id=r1_entry.id,
                final_votes=spec["r1_votes"],
                judge_score=spec["score"],
                final_rank=idx,
                outcome="QUALIFIED" if spec["qualified_r2"] else "ELIMINATED",
                advanced_to_round_id=round2.id if r2_entry else None,
                reason=f"Ranked #{idx} of 5 in Round 1 (cutoff top 4)",
            )
        )

        notify_user(
            user_id=u.id,
            notif_type="NOMINATED",
            title=f"Welcome to {comp.title}!",
            body="Your nominee dashboard is live. Share your unique voting link and QR code with supporters.",
            action_url="/portal/voting",
            send_external=False,
        )

    # 7. Seed 2 pending applicants in the Review Queue so Admin/Reviewer queue has live items
    applicant1 = User(
        full_name="benaiah Adjei",
        email="applicant@stagelight.gh",
        phone="+233242220001",
        password_hash=hash_password("Applicant@2026!"),
        is_verified=True,
        location="Kumasi, Ashanti",
        status="ACTIVE",
    )
    applicant1.full_name = "Benaiah Adjei"
    applicant2 = User(
        full_name="Adwoa Pokuaa",
        email="adwoa@stagelight.gh",
        phone="+233242220002",
        password_hash=hash_password("Applicant@2026!"),
        is_verified=True,
        location="Sunyani, Bono",
        status="ACTIVE",
    )
    db.session.add_all([applicant1, applicant2])
    db.session.flush()
    grant_role(applicant1, "APPLICANT")
    grant_role(applicant2, "APPLICANT")

    pending_app1 = Application(
        user_id=applicant1.id,
        competition_id=comp.id,
        category_id=cat_music.id,
        reference_no="APP-2026-PEND01",
        stage_name="Benaiah Strings",
        contact_email=applicant1.email,
        contact_phone=applicant1.phone,
        location=applicant1.location,
        status="UNDER_REVIEW",
        submitted_at=now - timedelta(days=2),
    )
    pending_app2 = Application(
        user_id=applicant2.id,
        competition_id=comp.id,
        category_id=cat_dance.id,
        reference_no="APP-2026-PEND02",
        stage_name="Adwoa Rhythm",
        contact_email=applicant2.email,
        contact_phone=applicant2.phone,
        location=applicant2.location,
        status="SUBMITTED",
        submitted_at=now - timedelta(days=1),
    )
    db.session.add_all([pending_app1, pending_app2])
    db.session.flush()

    db.session.add_all(
        [
            Submission(
                application_id=pending_app1.id,
                version_no=1,
                title="Kumasi Midnight Serenade (Live Guitar)",
                description="Solo acoustic Highlife ballad performed live in one uncut take.",
                biography="Self-taught guitarist and vocalist from KNUST.",
                external_video_url="https://www.youtube.com/watch?v=kJQP7kiw5Fk",
            ),
            Review(
                application_id=pending_app1.id,
                reviewer_user_id=reviewer.id,
                score=88.0,
                recommendation="NOMINATE",
                internal_notes="Clean vocals and authentic Highlife arrangement — ready for manager nomination.",
            ),
            Submission(
                application_id=pending_app2.id,
                version_no=1,
                title="Adowa Meets Afrobeats Fusion",
                description="Contemporary choreography Honouring traditional Ashanti Adowa gestures with modern Afrobeats tempo.",
                biography="Dance instructor and choreographer based in Sunyani.",
                external_video_url="https://vimeo.com/1084537",
            ),
        ]
    )

    # 8. Platform settings (announcements & FAQ & payments)
    db.session.add_all(
        [
            PlatformSetting(
                key="voting_control",
                value_json={"global_voting_paused": False, "incident_message": ""},
            ),
            PlatformSetting(
                key="payment_gateway",
                value_json={
                    "active_provider": "mock",
                    "environment": "sandbox",
                    "currency": "GHS",
                    "allow_mobile_money": True,
                    "allow_card": True,
                    "min_amount_ghs": 1.0,
                    "max_daily_spend_ghs": 5000.0,
                    "platform_fee_percent": 0.0,
                    "auto_settle_mock": True,
                    "paystack": {
                        "enabled": True,
                        "public_key": "pk_test_stagelight_gh_mock_key",
                        "secret_key": "sk_test_stagelight_gh_mock_key",
                        "webhook_secret": "mock-webhook-secret",
                        "base_url": "https://api.paystack.co",
                    },
                    "hubtel": {
                        "enabled": False,
                        "client_id": "",
                        "client_secret": "",
                        "merchant_account_number": "",
                    },
                    "flutterwave": {
                        "enabled": False,
                        "public_key": "",
                        "secret_key": "",
                        "encryption_key": "",
                        "webhook_secret": "",
                    },
                },
            ),
            PlatformSetting(
                key="announcements",
                value_json={
                    "items": [
                        {
                            "id": "ann-1",
                            "title": "Round 2 Quarterfinal Voting Is Now Open!",
                            "date": "2026-11-12",
                            "summary": "Round 1 results have been published and verified. Support your favourite Quarterfinalists before voting closes!",
                        },
                        {
                            "id": "ann-2",
                            "title": "Wildcard Talent Submissions Still Open",
                            "date": "2026-11-10",
                            "summary": "Singers, dancers, spoken-word poets, and comedians across Ghana can still submit demos for wildcard review.",
                        },
                    ]
                },
            ),
        ]
    )
    seed_sponsors_partners_if_empty(comp=comp, creator=manager, commit=False)
    seed_payouts_if_empty(comp=comp, commit=False)
    db.session.commit()


def seed_sponsors_partners_if_empty(comp: Competition | None = None, creator: User | None = None, commit: bool = True):
    if SponsorPartner.query.first() is not None:
        return

    if comp is None:
        comp = Competition.query.order_by(Competition.created_at.desc()).first()
    if creator is None:
        creator = User.query.filter_by(email="manager@stagelight.gh").first() or User.query.first()

    creator_id = creator.id if creator else None
    comp_id = comp.id if comp else None
    now = utcnow()

    demo_orgs = [
        # --- OFFICIAL SPONSORS ---
        SponsorPartner(
            kind="SPONSOR",
            name="GoldenCoast Bank Ghana",
            slug="goldencoast-bank-ghana",
            tier_or_category="TITLE",
            competition_id=comp_id,
            badge_label="Official Title & Grand Prize Sponsor",
            tagline="Empowering Ghana's creative entrepreneurs from first audition to national stardom.",
            description=(
                "GoldenCoast Bank Ghana serves as the official headline sponsor of StageLight Ghana 2026, "
                "underwriting the GHS 100,000 Grand Prize pool and delivering dedicated creative-economy "
                "banking, royalty management workshops, and financial mentorship to every shortlisted nominee."
            ),
            contribution_summary="Underwrites the GHS 100,000 Championship Crown & Finalist Financial Bootcamps",
            highlights_json=[
                "GHS 100,000 Grand Finale Prize Pool",
                "Zero-fee Creative Starter Accounts for Top 20 Nominees",
                "16-Region Youth Financial Literacy Workshops",
                "Grand Finale Trophy & Scholarship Presenter",
            ],
            quote_text=(
                "Ghana's music, dance, and spoken-word talent is world-class. StageLight's ledger-verified "
                "voting gives us total confidence that every cedi and every fan vote rewards genuine artistry."
            ),
            quote_author="Nana Kwame Ofori, Head of Brand & Creative Banking",
            website_url="https://goldencoastbank.com.gh",
            brand_initials="GCB",
            accent_color="#d97706",
            location="Ridge, Accra",
            since_year=2024,
            contact_name="Nana Kwame Ofori",
            contact_email="sponsorships@goldencoastbank.com.gh",
            contact_phone="+233302700100",
            is_featured=True,
            sort_order=10,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="Akwaaba Fiber & Telecom",
            slug="akwaaba-fiber-telecom",
            tier_or_category="PLATINUM",
            competition_id=comp_id,
            badge_label="Official Connectivity & Livestream Sponsor",
            tagline="High-speed fiber and 5G connectivity bringing every audition performance to every screen.",
            description=(
                "Akwaaba Fiber & Telecom powers zero-rated audition upload kiosks at regional community hubs "
                "and delivers ultra-low-latency HD livestreams for the National Quarterfinals and Grand Finale, "
                "connecting supporters across Ghana and the global diaspora."
            ),
            contribution_summary="Provides Free Regional Demo Upload Hotspots & 4K Live Show Streaming",
            highlights_json=[
                "Zero-rated demo upload booths in 10 regional capitals",
                "Dedicated fiber uplinks for live Quarterfinal & Finale nights",
                "Unlimited creator data bundles for all advancing finalists",
            ],
            quote_text=(
                "A brilliant singer in Tamale or Cape Coast deserves the same crystal-clear spotlight as a "
                "performer in Accra. Together with StageLight, we keep every stage connected."
            ),
            quote_author="Abena Kyei-Baffour, Chief Commercial Officer",
            website_url="https://akwaabatelecom.gh",
            brand_initials="AFT",
            accent_color="#0284c7",
            location="Airport City, Accra",
            since_year=2024,
            contact_name="Abena Kyei-Baffour",
            contact_email="brand@akwaabatelecom.gh",
            contact_phone="+233302700200",
            is_featured=True,
            sort_order=20,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="Sankofa Tropical Beverages",
            slug="sankofa-tropical-beverages",
            tier_or_category="GOLD",
            competition_id=comp_id,
            badge_label="Official Audition Tour & Fan Zone Sponsor",
            tagline="Crafted from Ghanaian pineapple, ginger, and hibiscus to refresh every live stage moment.",
            description=(
                "Sankofa Tropical Beverages brings vibrant outdoor fan zones, listening lounges, and backstage "
                "artist hydration stations to every StageLight regional showcase from Takoradi and Kumasi to Accra."
            ),
            contribution_summary="Sponsors the Afrobeats & Highlife Category plus Live Fan Zone Experiences",
            highlights_json=[
                "Category Sponsor — Afrobeats & Highlife Vocals",
                "Interactive outdoor fan zones & tasting bars at live shows",
                "12-month brand ambassador contract for People's Choice standout",
            ],
            website_url="https://sankofadrinks.com.gh",
            brand_initials="STB",
            accent_color="#059669",
            location="Tema Industrial Area, Greater Accra",
            since_year=2025,
            contact_name="Kojo Mensah-Bonsu",
            contact_email="partnerships@sankofadrinks.com.gh",
            contact_phone="+233303400310",
            is_featured=True,
            sort_order=30,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="Ashanti Shield Assurance",
            slug="ashanti-shield-assurance",
            tier_or_category="GOLD",
            competition_id=None,
            badge_label="Official Contestant Welfare & Event Sponsor",
            tagline="Protecting Ghana's performers, instruments, and live productions nationwide.",
            description=(
                "Ashanti Shield Assurance provides comprehensive travel, health, performance-equipment, and "
                "live-venue insurance across all StageLight competitions, ensuring artists and production teams "
                "focus entirely on delivering unforgettable performances."
            ),
            contribution_summary="Covers Contestant Travel, Stage Equipment & Finale Production Assurance",
            highlights_json=[
                "Full travel & health cover for advancing regional nominees",
                "Musical instrument & stage rig protection policy",
                "GHS 15,000 Judge's Excellence Award underwriter",
            ],
            website_url="https://ashantishield.com.gh",
            brand_initials="ASA",
            accent_color="#b45309",
            location="Adum, Kumasi & Accra",
            since_year=2025,
            contact_name="Maame Yaa Prempeh",
            contact_email="corporate@ashantishield.com.gh",
            contact_phone="+233322090400",
            is_featured=True,
            sort_order=40,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="Kente Loom Couture",
            slug="kente-loom-couture",
            tier_or_category="SILVER",
            competition_id=comp_id,
            badge_label="Official Stage Wardrobe & Styling Sponsor",
            tagline="Contemporary Ghanaian fashion woven from authentic Bonwire and Agotime heritage textiles.",
            description=(
                "Kente Loom Couture outfits StageLight hosts, Quarterfinalists, and Grand Finale contenders in "
                "bespoke modern silhouettes celebrating Ghanaian craftsmanship on camera and under stage lights."
            ),
            contribution_summary="Designs Custom Finale Stage Wardrobe & Editorial Portrait Styling",
            highlights_json=[
                "Custom Grand Finale looks for all Top 3 contenders",
                "Dedicated backstage styling team for live broadcasts",
            ],
            website_url="https://kenteloom.gh",
            brand_initials="KLC",
            accent_color="#7c3aed",
            location="Osu, Accra",
            since_year=2025,
            contact_name="Dzifa Agbeko",
            contact_email="studio@kenteloom.gh",
            contact_phone="+233244800510",
            is_featured=False,
            sort_order=50,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="VoltaSun Clean Energy",
            slug="voltasun-clean-energy",
            tier_or_category="SILVER",
            competition_id=None,
            badge_label="Official Clean Stage Power Sponsor",
            tagline="Silent hybrid solar-battery systems keeping Ghana's stages bright without interruption.",
            description=(
                "VoltaSun Clean Energy supplies commercial solar-hybrid battery arrays for outdoor audition "
                "showcases and broadcast vans, guaranteeing zero-downtime sound, lighting, and voting terminals."
            ),
            contribution_summary="Delivers Uninterrupted Solar-Hybrid Stage & Broadcast Power",
            highlights_json=[
                "100% uptime silent battery rigs for regional showcases",
                "Low-carbon live production power footprint",
            ],
            website_url="https://voltasunenergy.gh",
            brand_initials="VSE",
            accent_color="#0d9488",
            location="Ho, Volta & Tema",
            since_year=2026,
            contact_name="Selorm Gbedemah",
            contact_email="events@voltasunenergy.gh",
            contact_phone="+233244800620",
            is_featured=False,
            sort_order=60,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="SPONSOR",
            name="Savannah Gold Shea Collective",
            slug="savannah-gold-shea-collective",
            tier_or_category="SUPPORTING",
            competition_id=comp_id,
            badge_label="Northern Belt Audition & Backstage Supporter",
            tagline="Women-led organic shea skincare and travel bursaries uplifting Northern Ghana creatives.",
            description=(
                "Founded by women's cooperatives in Tamale and Bolgatanga, Savannah Gold Shea Collective funds "
                "inter-city travel stipends for Northern belt auditionees and curates backstage grooming kits."
            ),
            contribution_summary="Provides Northern Audition Travel Bursaries & Nominee Care Hampers",
            highlights_json=[
                "Travel bursaries for Tamale, Wa & Bolgatanga contestants",
                "Artisanal grooming hampers for every official nominee",
            ],
            website_url="https://savannahgoldshea.gh",
            brand_initials="SGS",
            accent_color="#c2410c",
            location="Tamale, Northern Region",
            since_year=2026,
            contact_name="Hajia Mariama Fuseini",
            contact_email="hello@savannahgoldshea.gh",
            contact_phone="+233372090730",
            is_featured=False,
            sort_order=70,
            status="ACTIVE",
            created_by=creator_id,
        ),
        # --- STRATEGIC & ECOSYSTEM PARTNERS ---
        SponsorPartner(
            kind="PARTNER",
            name="GhanaPay Fintech Network",
            slug="ghanapay-fintech-network",
            tier_or_category="PAYMENT_FINTECH",
            competition_id=None,
            badge_label="Official Verified Voting Payment Partner",
            tagline="Instant Mobile Money and Card settlement with cryptographic webhook verification.",
            description=(
                "GhanaPay Fintech Network powers StageLight's verified payment rails across MTN Mobile Money, "
                "Telecel Cash, AT Money, and Visa/Mastercard. Every transaction delivers HMAC-signed settlement "
                "notifications and server-to-server reconciliation directly into StageLight's immutable vote ledger."
            ),
            contribution_summary="Powers Verified Mobile Money & Card Checkout + Automated Reconciliation",
            highlights_json=[
                "MTN MoMo, Telecel Cash, AT Money & Card checkout in GHS",
                "HMAC-SHA256 signed webhooks & real-time status verification",
                "Automated pending-payment recovery & transparent refund hooks",
            ],
            quote_text=(
                "Public talent voting only works when supporters trust every single vote. Our direct ledger "
                "integration with StageLight guarantees zero phantom votes and instant digital receipts."
            ),
            quote_author="Kwabena Osei-Tutu, VP of Merchant Infrastructure",
            website_url="https://ghanapay.com.gh",
            brand_initials="GP",
            accent_color="#059669",
            location="Labone, Accra",
            since_year=2024,
            contact_name="Kwabena Osei-Tutu",
            contact_email="integrations@ghanapay.com.gh",
            contact_phone="+233302900110",
            is_featured=True,
            sort_order=10,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="PARTNER",
            name="GoldStar TV & 99.7 FM",
            slug="goldstar-tv-fm",
            tier_or_category="BROADCAST_MEDIA",
            competition_id=comp_id,
            badge_label="Official National TV & Radio Broadcast Partner",
            tagline="Syndicating StageLight auditions, nominee spotlights, and the live Finale across Ghana.",
            description=(
                "GoldStar TV & 99.7 FM brings weekly Friday-night StageLight audition recap shows, morning-drive "
                "radio interviews for advancing nominees, and live free-to-air television coverage of the Quarterfinals "
                "and December Grand Finale to millions of viewers nationwide."
            ),
            contribution_summary="Nationwide TV Broadcasts, Weekly Radio Spotlights & Red-Carpet Press",
            highlights_json=[
                "Free-to-air HD broadcast of Quarterfinals & Grand Finale",
                "Weekly 99.7 FM acoustic live lounge for nominated acts",
                "Syndicated regional radio updates across 14 affiliate stations",
            ],
            quote_text=(
                "StageLight captures the raw heartbeat of Ghanaian performance culture — from Highlife acoustics "
                "to spoken word and street choreography."
            ),
            quote_author="Ekow Blankson Jr., Director of Entertainment Programming",
            website_url="https://goldstarmedia.gh",
            brand_initials="GS",
            accent_color="#dc2626",
            location="Cantonments, Accra",
            since_year=2024,
            contact_name="Ekow Blankson Jr.",
            contact_email="programming@goldstarmedia.gh",
            contact_phone="+233302900220",
            is_featured=True,
            sort_order=20,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="PARTNER",
            name="Highlife SoundLab Studios",
            slug="highlife-soundlab-studios",
            tier_or_category="STUDIO_PRODUCTION",
            competition_id=comp_id,
            badge_label="Official Recording Studio & Mentorship Partner",
            tagline="World-class analog-digital recording rooms turning finalists into charting recording artists.",
            description=(
                "Highlife SoundLab Studios provides full EP recording, mixing, mastering, and live performance "
                "arrangement for StageLight's Top 3 finalists, alongside pre-show soundcheck coaching and "
                "multi-track audio capture for all live competition rounds."
            ),
            contribution_summary="Delivers Top 3 Finalist Studio Recording Deals & Live Sound Engineering",
            highlights_json=[
                "Full 5-track EP recording & mastering package for the Winner",
                "Single production & studio video session for Top 3 Finalists",
                "One-on-one vocal, rhythm & stagecraft mentorship clinics",
            ],
            website_url="https://highlifesoundlab.gh",
            brand_initials="HSL",
            accent_color="#d97706",
            location="East Legon, Accra",
            since_year=2024,
            contact_name="Kweku 'Beats' Mensah",
            contact_email="sessions@highlifesoundlab.gh",
            contact_phone="+233244900330",
            is_featured=True,
            sort_order=30,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="PARTNER",
            name="Accra Grand Dome & Arts Arena",
            slug="accra-grand-dome-arena",
            tier_or_category="VENUE_HOSPITALITY",
            competition_id=comp_id,
            badge_label="Official Live Showcase & Grand Finale Venue",
            tagline="Ghana's premier 4,500-seat concert hall and rehearsal complex in central Accra.",
            description=(
                "Accra Grand Dome & Arts Arena hosts StageLight's live Quarterfinal showcases, choreographer "
                "rehearsal residencies, media launch nights, and the flagship December Championship Finale."
            ),
            contribution_summary="Hosts Live Quarterfinal Showdowns, Rehearsals & the 4,500-Seat Finale",
            highlights_json=[
                "4,500-seat acoustically tuned main arena for the Grand Finale",
                "Dedicated dance, theatre & live-band rehearsal studios",
                "Accessible spectator seating & secure QR ticket entry",
            ],
            website_url="https://accragranddome.gh",
            brand_initials="AGD",
            accent_color="#1d4ed8",
            location="West Ridge, Accra",
            since_year=2025,
            contact_name="Araba Quansah",
            contact_email="bookings@accragranddome.gh",
            contact_phone="+233302900440",
            is_featured=True,
            sort_order=40,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="PARTNER",
            name="Adinkra Cloud & Assurance",
            slug="adinkra-cloud-assurance",
            tier_or_category="TELECOM_TECH",
            competition_id=None,
            badge_label="Official Cloud Media & Integrity Audit Partner",
            tagline="West African edge media hosting and independent round-close verification.",
            description=(
                "Adinkra Cloud & Assurance supports encrypted audition media storage, automated malware scanning, "
                "peak-night voting scalability, and independent verification of published elimination snapshots."
            ),
            contribution_summary="Provides Edge Video Delivery, Security Scanning & Snapshot Auditing",
            highlights_json=[
                "Accra-hosted low-latency video transcoding & streaming edge",
                "Independent verification of round elimination snapshots",
                "24/7 finale-night DDoS & payment-burst telemetry",
            ],
            website_url="https://adinkracloud.gh",
            brand_initials="ACA",
            accent_color="#4f46e5",
            location="Dzorwulu, Accra",
            since_year=2025,
            contact_name="Dr. Fiifi Dadzie",
            contact_email="trust@adinkracloud.gh",
            contact_phone="+233302900550",
            is_featured=True,
            sort_order=50,
            status="ACTIVE",
            created_by=creator_id,
        ),
        SponsorPartner(
            kind="PARTNER",
            name="Creative Youth Ghana Foundation",
            slug="creative-youth-ghana-foundation",
            tier_or_category="COMMUNITY_YOUTH",
            competition_id=None,
            badge_label="Official 16-Region Scouting & Campus Partner",
            tagline="Connecting grassroots arts centres and university creative societies to national stages.",
            description=(
                "Creative Youth Ghana Foundation coordinates regional audition clinics, campus talent drives, "
                "guardian-consent guidance for young performers, and post-competition career alumni networks "
                "across all 16 administrative regions."
            ),
            contribution_summary="Mobilizes Community Arts Hubs & Campus Audition Clinics in All 16 Regions",
            highlights_json=[
                "38 partner community arts centres & university hubs",
                "Free smartphone demo-recording clinics for first-time applicants",
                "Post-competition touring & arts grant advisory for alumni",
            ],
            website_url="https://creativeyouthghana.org",
            brand_initials="CYG",
            accent_color="#0f766e",
            location="Kumasi, Cape Coast, Tamale & Accra",
            since_year=2024,
            contact_name="Akua Boatemaa Sarpong",
            contact_email="programs@creativeyouthghana.org",
            contact_phone="+233208900660",
            is_featured=True,
            sort_order=60,
            status="ACTIVE",
            created_by=creator_id,
        ),
    ]
    db.session.add_all(demo_orgs)

    if PartnershipInquiry.query.first() is None:
        db.session.add_all(
            [
                PartnershipInquiry(
                    reference_no=generate_reference("SPN"),
                    inquiry_type="SPONSOR",
                    organization_name="CocoaRoyale Confectionery Ghana",
                    contact_name="Nii Armah Tagoe",
                    contact_role="Brand Activation Manager",
                    contact_email="brand@cocoaroyale.com.gh",
                    contact_phone="+233244321900",
                    website_url="https://cocoaroyale.com.gh",
                    location="Spintex, Accra",
                    desired_tier_or_category="GOLD",
                    competition_id=comp_id,
                    budget_range="GHS 50,000 - GHS 115,000",
                    goals_message=(
                        "We would love to sponsor the Afro-Dance & Choreography category for the Grand Finale "
                        "and provide branded gift boxes plus a GHS 20,000 Best Choreography cash bonus."
                    ),
                    status="NEW",
                    created_at=now - timedelta(days=1),
                ),
                PartnershipInquiry(
                    reference_no=generate_reference("PRT"),
                    inquiry_type="PARTNER",
                    organization_name="BeatWave Africa Digital",
                    contact_name="Efua Yankson",
                    contact_role="Head of Artist Relations, West Africa",
                    contact_email="partners@beatwaveafrica.com",
                    contact_phone="+233558112233",
                    website_url="https://beatwaveafrica.com",
                    location="Osu, Accra",
                    desired_tier_or_category="BROADCAST_MEDIA",
                    competition_id=comp_id,
                    budget_range="Editorial Curation & Digital Distribution",
                    goals_message=(
                        "Proposing an official streaming & playlist partnership featuring all StageLight Quarterfinal "
                        "and Finale live performances on our Ghana Rising editorial hub."
                    ),
                    status="UNDER_REVIEW",
                    admin_notes="Initial deck shared; call scheduled with partnerships team.",
                    reviewed_by=creator_id,
                    reviewed_at=now - timedelta(hours=12),
                    created_at=now - timedelta(days=3),
                ),
            ]
        )

    if commit:
        db.session.commit()


def seed_payouts_if_empty(comp: Competition | None = None, commit: bool = True):
    from app.models.financial import Payout
    if Payout.query.first() is not None:
        return

    if comp is None:
        comp = Competition.query.order_by(Competition.created_at.desc()).first()
    comp_id = comp.id if comp else None

    approver = User.query.filter_by(email="finance@stagelight.gh").first() or User.query.filter_by(email="admin@stagelight.gh").first()
    approver_id = approver.id if approver else None

    nominees = Nominee.query.filter_by(status="ACTIVE").limit(3).all()
    nom1 = nominees[0] if len(nominees) > 0 else None
    nom2 = nominees[1] if len(nominees) > 1 else None

    now = utcnow()

    demo_payouts = [
        Payout(
            reference_no="DISB-2026-0001",
            title="StageLight Ghana 2026 — 1st Place Champion Cash Prize (Tranche 1)",
            payout_type="PRIZE",
            beneficiary_type="NOMINEE",
            beneficiary_name=nom1.public_name if nom1 else "Kofi Mensah",
            beneficiary_contact="+233240112233",
            competition_id=comp_id,
            nominee_id=nom1.id if nom1 else None,
            amount_minor=5000000,
            tax_withheld_minor=250000,
            net_amount_minor=4750000,
            currency="GHS",
            payment_method="BANK_TRANSFER",
            account_details="Stanbic Bank Ghana — ACC: 9040001882910 — High Street Branch",
            status="APPROVED",
            scheduled_date=now + timedelta(days=5),
            approved_by_user_id=approver_id,
            approved_at=now - timedelta(days=1),
            notes="Initial 50% milestone disbursement per Official Charter Section 4.1 upon audit clearance.",
        ),
        Payout(
            reference_no="DISB-2026-0002",
            title="StageLight Ghana 2026 — 2nd Place Runner-Up Cash Prize (Full Allocation)",
            payout_type="PRIZE",
            beneficiary_type="NOMINEE",
            beneficiary_name=nom2.public_name if nom2 else "Efya Serwaa",
            beneficiary_contact="+233201223344",
            competition_id=comp_id,
            nominee_id=nom2.id if nom2 else None,
            amount_minor=4000000,
            tax_withheld_minor=200000,
            net_amount_minor=3800000,
            currency="GHS",
            payment_method="BANK_TRANSFER",
            account_details="GCB Bank PLC — ACC: 1041128394019 — Kwame Nkrumah Circle",
            status="PENDING_APPROVAL",
            scheduled_date=now + timedelta(days=10),
            notes="Full prize allocation awaiting second-person finance clearance and Ghana Card verification.",
        ),
        Payout(
            reference_no="DISB-2026-0003",
            title="Highlife Voice of the Nation — Category Excellence Grant",
            payout_type="GRANT",
            beneficiary_type="NOMINEE",
            beneficiary_name="Kwabena Boadi (Highlife Vocals)",
            beneficiary_contact="+233244998811",
            competition_id=comp_id,
            amount_minor=500000,
            tax_withheld_minor=25000,
            net_amount_minor=475000,
            currency="GHS",
            payment_method="MOBILE_MONEY",
            account_details="MTN Mobile Money — +233244998811 (Kwabena Boadi)",
            status="DISBURSED",
            scheduled_date=now - timedelta(days=3),
            disbursed_at=now - timedelta(days=3),
            approved_by_user_id=approver_id,
            approved_at=now - timedelta(days=4),
            transaction_reference="MM-GH-8829104",
            notes="Special jury grant for exceptional Highlife vocal demonstration and studio preparation.",
        ),
        Payout(
            reference_no="DISB-2026-0004",
            title="Master of the Rhythm & Stage — Category Excellence Grant",
            payout_type="GRANT",
            beneficiary_type="NOMINEE",
            beneficiary_name="Esi Darkwah (Afro-Dance)",
            beneficiary_contact="+233201998877",
            competition_id=comp_id,
            amount_minor=500000,
            tax_withheld_minor=25000,
            net_amount_minor=475000,
            currency="GHS",
            payment_method="MOBILE_MONEY",
            account_details="Telecel Cash — +233201998877 (Esi Darkwah)",
            status="DISBURSED",
            scheduled_date=now - timedelta(days=6),
            disbursed_at=now - timedelta(days=5),
            approved_by_user_id=approver_id,
            approved_at=now - timedelta(days=6),
            transaction_reference="TC-GH-4921008",
            notes="Accra Grand Dome dance residency and choreography development support grant.",
        ),
        Payout(
            reference_no="DISB-2026-0005",
            title="Regional Audition Showcase — Sound & Lighting Engineering Production Stipend",
            payout_type="PRODUCTION",
            beneficiary_type="VENDOR",
            beneficiary_name="Accra SoundWorks & Live Stages Ltd",
            beneficiary_contact="+233302220199",
            competition_id=comp_id,
            amount_minor=750000,
            tax_withheld_minor=37500,
            net_amount_minor=712500,
            currency="GHS",
            payment_method="BANK_TRANSFER",
            account_details="Ecobank Ghana — ACC: 00210394812 — Ridge Branch",
            status="DISBURSED",
            scheduled_date=now - timedelta(days=8),
            disbursed_at=now - timedelta(days=7),
            approved_by_user_id=approver_id,
            approved_at=now - timedelta(days=8),
            transaction_reference="ECO-BFT-918203",
            notes="Regional audition tour live sound reinforcement, microphones, and wireless monitor rigs.",
        ),
        Payout(
            reference_no="DISB-2026-0006",
            title="Northern Belt Auditions — Contestant Travel & Welfare Stipend",
            payout_type="STIPEND",
            beneficiary_type="CONTESTANT",
            beneficiary_name="Tamale Cultural Centre Youth Liaison",
            beneficiary_contact="+233277112244",
            competition_id=comp_id,
            amount_minor=300000,
            tax_withheld_minor=0,
            net_amount_minor=300000,
            currency="GHS",
            payment_method="MOBILE_MONEY",
            account_details="AT Money — +233277112244",
            status="APPROVED",
            scheduled_date=now + timedelta(days=2),
            approved_by_user_id=approver_id,
            approved_at=now - timedelta(hours=12),
            notes="Transportation and accommodation subsidy for 12 northern belt semi-final auditionees.",
        ),
    ]

    for p in demo_payouts:
        db.session.add(p)

    if commit:
        db.session.commit()


def _seed_paid_vote_bundle(nominee: Nominee, round_obj: Round, entry: RoundEntry, vote_qty: int, created_at):
    order_ref = generate_reference("ORD")
    receipt = generate_reference("TH")
    provider_ref = f"GPAY-SEED-{generate_opaque_slug(7).upper()}"
    tx_id = f"TXN-SEED-{generate_opaque_slug(7).upper()}"
    amount_minor = vote_qty * 100

    order = Order(
        public_reference=order_ref,
        receipt_code=receipt,
        voter_name="Supporter",
        voter_phone="+233249990000",
        payment_channel="mobile_money",
        nominee_id=nominee.id,
        round_id=round_obj.id,
        round_entry_id=entry.id,
        package_name_snapshot=f"Verified Bundle ({vote_qty} votes)",
        vote_quantity=vote_qty,
        unit_price_minor=100,
        fee_minor=0,
        amount_minor=amount_minor,
        currency="GHS",
        status="PAID",
        created_at=created_at,
        paid_at=created_at,
    )
    db.session.add(order)
    db.session.flush()

    payment = Payment(
        order_id=order.id,
        provider="mock",
        channel="mobile_money",
        provider_reference=provider_ref,
        provider_transaction_id=tx_id,
        amount_minor=amount_minor,
        currency="GHS",
        status="SUCCESS",
        verified_at=created_at,
        raw_metadata_safe={"gateway": "GhanaPay Sandbox", "network": "MTN Mobile Money"},
        created_at=created_at,
    )
    db.session.add(payment)
    db.session.flush()

    register_settled_mock_tx(
        provider_reference=provider_ref,
        provider_transaction_id=tx_id,
        order_reference=order_ref,
        amount_minor=amount_minor,
        currency="GHS",
        channel="mobile_money",
        status="SUCCESS",
    )

    ledger = VoteLedger(
        order_id=order.id,
        payment_id=payment.id,
        nominee_id=nominee.id,
        round_id=round_obj.id,
        quantity=vote_qty,
        entry_type="CREDIT",
        reason=f"Verified payment {provider_ref}",
        created_at=created_at,
    )
    db.session.add(ledger)
    db.session.flush()
