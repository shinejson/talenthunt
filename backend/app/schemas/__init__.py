from marshmallow import Schema, ValidationError, fields, validate, validates_schema


class DomainError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, fields_map: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fields = fields_map or {}


def validate_payload(schema_cls: type[Schema], payload: dict | None) -> dict:
    schema = schema_cls()
    try:
        return schema.load(payload or {})
    except ValidationError as exc:
        raise DomainError(
            code="VALIDATION_ERROR",
            message="Please correct the highlighted fields.",
            status_code=422,
            fields_map=exc.messages,
        ) from exc


class RegisterSchema(Schema):
    full_name = fields.String(required=True, validate=validate.Length(min=2, max=150))
    email = fields.Email(load_default=None, allow_none=True)
    phone = fields.String(load_default=None, allow_none=True, validate=validate.Length(min=7, max=30))
    password = fields.String(required=True, validate=validate.Length(min=8, max=128))
    location = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))

    @validates_schema
    def require_email_or_phone(self, data, **kwargs):
        email = (data.get("email") or "").strip()
        phone = (data.get("phone") or "").strip()
        if not email and not phone:
            raise ValidationError({"email": ["Provide an email address or phone number."]})


class LoginSchema(Schema):
    identifier = fields.String(load_default=None, allow_none=True)
    email = fields.String(load_default=None, allow_none=True)
    password = fields.String(required=True, validate=validate.Length(min=1, max=128))

    @validates_schema
    def check_identifier(self, data, **kwargs):
        ident = (data.get("identifier") or data.get("email") or "").strip()
        if not ident:
            raise ValidationError({"identifier": ["Email or phone number is required."]})
        data["identifier"] = ident


class ApplicationCreateSchema(Schema):
    competition_id = fields.String(required=True)
    category_id = fields.String(required=True)
    stage_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    title = fields.String(required=True, validate=validate.Length(min=3, max=200))
    description = fields.String(required=True, validate=validate.Length(min=10, max=4000))
    biography = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=3000))
    location = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    contact_email = fields.String(load_default=None, allow_none=True)
    contact_phone = fields.String(load_default=None, allow_none=True)
    external_video_url = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=500))
    media_asset_id = fields.String(load_default=None, allow_none=True)
    is_minor = fields.Boolean(load_default=False)
    guardian_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    guardian_contact = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=100))
    guardian_consent = fields.Boolean(load_default=False)
    consent_accepted = fields.Boolean(required=True)
    rights_declaration = fields.Boolean(required=True)


class OrderCreateSchema(Schema):
    nominee_id = fields.String(load_default=None, allow_none=True)
    voting_slug = fields.String(load_default=None, allow_none=True)
    round_id = fields.String(load_default=None, allow_none=True)
    package_id = fields.String(load_default=None, allow_none=True)
    vote_quantity = fields.Integer(load_default=None, allow_none=True, validate=validate.Range(min=1, max=100000))
    payment_channel = fields.String(
        load_default="mobile_money",
        validate=validate.OneOf(["mobile_money", "card"]),
    )
    voter_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    voter_email = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=255))
    voter_phone = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=40))

    @validates_schema
    def check_target_and_qty(self, data, **kwargs):
        if not data.get("nominee_id") and not data.get("voting_slug"):
            raise ValidationError({"voting_slug": ["Nominee or voting link slug is required."]})
        if not data.get("package_id") and not data.get("vote_quantity"):
            raise ValidationError({"vote_quantity": ["Select a vote package or enter a vote quantity."]})
