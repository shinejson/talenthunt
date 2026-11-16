import os
import sys
import tempfile
import pytest

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.integrations.payments.mock_adapter import reset_mock_provider_store


@pytest.fixture()
def app():
    tmp_uploads = tempfile.mkdtemp(prefix="stagelight_uploads_")
    tmp_db_fd, tmp_db_path = tempfile.mkstemp(prefix="stagelight_test_", suffix=".db")
    os.close(tmp_db_fd)

    class LocalTestConfig(TestConfig):
        UPLOAD_FOLDER = tmp_uploads
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_db_path}"

    flask_app = create_app(LocalTestConfig)
    reset_mock_provider_store()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.engine.dispose()
    if os.path.exists(tmp_db_path):
        os.remove(tmp_db_path)
    reset_mock_provider_store()


@pytest.fixture()
def client(app):
    return app.test_client()
