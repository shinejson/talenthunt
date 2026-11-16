from datetime import timedelta

from app.extensions import db
from app.integrations.payments.mock_adapter import register_settled_mock_tx
from app.models.application import Application, Review, Submission
from app.models.competition import Category, Competition, Round, VotePackage
from app.models.elimination import EliminationResult, EliminationRun
from app.models.nominee import Nominee, RoundEntry
from app.models.operations import PlatformSetting
from app.models.user import User
from app.models.voting import Order, Payment, VoteLedger
from app.services.auth_service import ensure_roles_exist, grant_role
from app.services.notification_service import notify_user
from app.utils.security import generate_opaque_slug, generate_reference, hash_password
from app.utils.time_utils import utcnow


def seed_demo_data_if_empty():
    ensure_roles_exist()
    if User.query.first() is not None:
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
        prize_summary="GHS 100,000 Grand Prize + Studio Recording & Performance Tour",
        rules=(
            "1. All demos must be original performances by the applicant.\n"
            "2. Votes are priced at GHS 1.00 per vote (with bundle packages available) and are counted ONLY after confirmed payment verification.\n"
            "3. Elimination uses Top-N progression per round; ties are broken by panel judge score followed by earliest verified qualifying vote timestamp.\n"
            "4. Refunds or chargebacks generate an auditable reversal entry on the vote ledger.\n"
            "5. Applicants under 18 require verifiable parent/guardian consent."
        ),
        eligibility="Open to solo acts and duos resident in Ghana aged 15 and above (guardian consent required under 18).",
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

    # 8. Platform settings (announcements & FAQ)
    db.session.add_all(
        [
            PlatformSetting(
                key="voting_control",
                value_json={"global_voting_paused": False, "incident_message": ""},
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
