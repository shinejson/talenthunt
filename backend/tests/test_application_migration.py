from pathlib import Path

from flask_migrate import downgrade, stamp, upgrade
from sqlalchemy import inspect

from app.extensions import db
from app.models.application import Application, MediaAsset, Review, Submission
from app.models.nominee import Nominee, RoundEntry
from app.models.user import User
from app.services.seed_service import seed_demo_data_if_empty


def test_guest_migration_preserves_existing_applications_and_media(app):
    migrations = str(Path(__file__).resolve().parents[1] / "migrations")
    with app.app_context():
        seed_demo_data_if_empty()
        application = Application.query.filter_by(status="NOMINATED").first()
        photo = MediaAsset(
            owner_user_id=application.user_id,
            original_filename="prior-photo.png",
            storage_key="prior-photo.png",
            mime_type="image/png",
            size_bytes=100,
        )
        db.session.add(photo)
        db.session.flush()
        application.applicant.profile_image = photo
        db.session.commit()
        app_id, photo_id, user_id = application.id, photo.id, application.user_id
        models = (Application, Submission, Review, MediaAsset, Nominee, RoundEntry)
        counts = [model.query.count() for model in models]
        db.session.remove()

        stamp(directory=migrations, revision="head")
        downgrade(directory=migrations, revision="0001_applicant_profile_fields")
        assert not next(c for c in inspect(db.engine).get_columns("applications") if c["name"] == "user_id")["nullable"]
        upgrade(directory=migrations)

        assert [model.query.count() for model in models] == counts
        assert db.session.get(Application, app_id).user_id == user_id
        assert db.session.get(User, user_id).profile_image_id == photo_id
        assert not db.session.get(MediaAsset, photo_id).is_private
        assert db.session.execute(db.text("PRAGMA foreign_keys")).scalar() == 1
        assert not db.session.execute(db.text("PRAGMA foreign_key_check")).all()
