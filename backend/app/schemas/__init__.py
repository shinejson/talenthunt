from marshmallow import Schema, ValidationError, fields, pre_load, validate, validates_schema


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


class ApplicationDetailsSchema(Schema):
    competition_id = fields.String(required=True, validate=validate.Length(min=1, max=36))
    category_id = fields.String(required=True, validate=validate.Length(min=1, max=36))
    stage_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    title = fields.String(required=True, validate=validate.Length(min=3, max=200))
    description = fields.String(required=True, validate=validate.Length(min=10, max=4000))
    biography = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=3000))
    location = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    genre = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=100))
    contact_email = fields.String(load_default=None, allow_none=True)
    contact_phone = fields.String(load_default=None, allow_none=True)
    external_video_url = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=500))
    guardian_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    guardian_contact = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=100))
    guardian_consent = fields.Boolean(load_default=False)
    consent_accepted = fields.Boolean(required=True)
    rights_declaration = fields.Boolean(required=True)


class ApplicationCreateSchema(ApplicationDetailsSchema):
    media_asset_id = fields.String(load_default=None, allow_none=True)
    is_minor = fields.Boolean(load_default=False)


class GuestApplicationSchema(ApplicationDetailsSchema):
    full_name = fields.String(required=True, validate=validate.Length(min=2, max=150))
    contact_email = fields.Email(required=True, validate=validate.Length(max=255))
    contact_phone = fields.String(required=True, validate=validate.Regexp(
        r"^\+?[0-9][0-9 ().-]{5,38}[0-9]$", error="Enter a valid phone number."
    ))
    location = fields.String(required=True, validate=validate.Length(min=2, max=150))
    date_of_birth = fields.Date(required=True)
    is_group = fields.Boolean(load_default=False)
    group_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=150))
    group_member_count = fields.Integer(load_default=None, allow_none=True, strict=True, validate=validate.Range(min=2, max=1000))

    @pre_load
    def trim_strings(self, data, **kwargs):
        if not isinstance(data, dict):
            return data
        return {key: value.strip() if isinstance(value, str) else value for key, value in data.items()}

    @validates_schema
    def validate_group(self, data, **kwargs):
        if data["is_group"] and not (data.get("group_name") and data.get("group_member_count")):
            raise ValidationError({"group_name": ["Enter the group name and number of performers."]})
        if not data["is_group"] and (data.get("group_name") or data.get("group_member_count")):
            raise ValidationError({"group_name": ["Only groups can enter group details."]})


class ApplicationTrackingSchema(Schema):
    tracking_code = fields.String(required=True, validate=validate.Length(min=1, max=50))
    contact_email = fields.Email(required=True, validate=validate.Length(max=255))


class AcceptInvitationSchema(Schema):
    token = fields.String(required=True, validate=validate.Regexp(r"^[a-f0-9]{64}\Z"))
    password = fields.String(required=True, validate=validate.Length(min=8, max=128))


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
