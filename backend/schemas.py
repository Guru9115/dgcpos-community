"""
DGC RetailOS — Request Validation Schemas (Marshmallow)
All POST/PUT endpoints validate through these schemas before processing.
"""
from marshmallow import Schema, fields, validate, validates, ValidationError, pre_load
from marshmallow import EXCLUDE


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginSchema(Schema):
    class Meta: unknown = EXCLUDE
    username = fields.Str(required=True, validate=validate.Length(min=1, max=80))
    password = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    remember = fields.Bool(load_default=False)

class ChangePasswordSchema(Schema):
    class Meta: unknown = EXCLUDE
    current_password = fields.Str(required=True)
    new_password     = fields.Str(required=True, validate=validate.Length(min=8, max=200))

class CreateUserSchema(Schema):
    class Meta: unknown = EXCLUDE
    username   = fields.Str(required=True, validate=validate.Length(min=3, max=80))
    password   = fields.Str(required=True, validate=validate.Length(min=8, max=200))
    full_name  = fields.Str(load_default="")
    email      = fields.Email(load_default=None, allow_none=True)
    role       = fields.Str(load_default="sales_staff",
                            validate=validate.OneOf([
                                "superadmin", "owner", "manager", "sales_staff",
                                "staff", "operations_staff", "engineer",
                            ]))
    account_id = fields.Int(load_default=None, allow_none=True)

    @pre_load
    def normalize_optional_email(self, data, **kwargs):
        if "email" in data:
            val = (data.get("email") or "").strip()
            data["email"] = val or None
        return data


# ── Products ─────────────────────────────────────────────────────────────────

class ProductSchema(Schema):
    class Meta: unknown = EXCLUDE
    name          = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    sku           = fields.Str(load_default=None, allow_none=True)
    barcode       = fields.Str(load_default=None, allow_none=True)

    @pre_load
    def empty_strings_to_none(self, data, **kwargs):
        for f in ("sku", "barcode", "image_url"):
            if f in data and data[f] == "":
                data[f] = None
        return data
    category_id   = fields.Int(load_default=None, allow_none=True)
    cost_price    = fields.Float(load_default=0, validate=validate.Range(min=0))
    selling_price = fields.Float(required=True, validate=validate.Range(min=0))
    stock_qty     = fields.Int(load_default=0, validate=validate.Range(min=0))
    reorder_level = fields.Int(load_default=10, validate=validate.Range(min=0))
    unit          = fields.Str(load_default="pcs")
    status        = fields.Str(load_default="active",
                               validate=validate.OneOf(["active","inactive"]))
    image_url     = fields.Str(load_default=None, allow_none=True)

    @validates("selling_price")
    def price_positive(self, value):
        if value < 0:
            raise ValidationError("Selling price cannot be negative")


# ── Marketplace ─────────────────────────────────────────────────────────────

class MarketplacePostSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(load_default="", allow_none=True)
    price = fields.Float(load_default=0, validate=validate.Range(min=0))
    visibility = fields.Str(
        load_default="public",
        validate=validate.OneOf(["public", "private", "draft"]),
    )
    image_url = fields.Str(load_default=None, allow_none=True)
    product_id = fields.Int(load_default=None, allow_none=True)
    bazaar_category = fields.Str(
        load_default=None,
        allow_none=True,
        validate=validate.OneOf(["grocery", "fashion", "electronics", "home", "beauty", "kids"]),
    )


class MarketplaceOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    quantity = fields.Int(load_default=1, validate=validate.Range(min=1, max=99))
    message = fields.Str(load_default="", allow_none=True)
    delivery_address = fields.Str(required=True, validate=validate.Length(min=5, max=500))
    delivery_phone = fields.Str(required=True, validate=validate.Length(min=7, max=32))


class BazaarStayCheckoutLineSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    post_id = fields.Int(required=True)
    check_in_date = fields.Date(required=True)
    check_out_date = fields.Date(required=True)
    adults = fields.Int(load_default=1, validate=validate.Range(min=1, max=12))


class BazaarGuestCheckoutSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    guest_name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    guest_email = fields.Email(load_default=None, allow_none=True)
    delivery_phone = fields.Str(required=True, validate=validate.Length(min=7, max=32))
    delivery_address = fields.Str(required=True, validate=validate.Length(min=5, max=500))
    payment_method = fields.Str(
        load_default="cod",
        validate=validate.OneOf(["cod", "esewa"]),
    )
    message = fields.Str(load_default="", allow_none=True)
    items = fields.List(fields.Dict(), required=True, validate=validate.Length(min=1, max=20))


class BazaarTrackOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    order_number = fields.Str(required=True, validate=validate.Length(min=5, max=32))
    delivery_phone = fields.Str(required=True, validate=validate.Length(min=7, max=32))


class MarketplaceOrderStatusSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Str(
        required=True,
        validate=validate.OneOf([
            "accepted", "rejected", "packed", "dispatched", "delivered", "cancelled",
        ]),
    )
    create_delivery = fields.Bool(load_default=True)
    assigned_rider = fields.Str(load_default=None, allow_none=True)
    notes = fields.Str(load_default=None, allow_none=True)
    shipping_carrier = fields.Str(load_default=None, allow_none=True)
    tracking_number = fields.Str(load_default=None, allow_none=True)
    shipping_notes = fields.Str(load_default=None, allow_none=True)
    shipping_carrier = fields.Str(load_default=None, allow_none=True)
    tracking_number = fields.Str(load_default=None, allow_none=True)
    shipping_notes = fields.Str(load_default=None, allow_none=True)


# ── Sale Items ────────────────────────────────────────────────────────────────

class SaleItemSchema(Schema):
    class Meta: unknown = EXCLUDE
    product_id  = fields.Int(required=True)
    variant_id  = fields.Int(load_default=None, allow_none=True)
    qty         = fields.Int(required=True, validate=validate.Range(min=1, max=9999))
    unit_price  = fields.Float(load_default=None, allow_none=True,
                               validate=validate.Range(min=0))
    discount    = fields.Float(load_default=0.0, validate=validate.Range(min=0))


class CreateSaleSchema(Schema):
    class Meta: unknown = EXCLUDE
    items           = fields.List(fields.Nested(SaleItemSchema), required=True,
                                  validate=validate.Length(min=1, max=200))
    customer_id     = fields.Int(load_default=None, allow_none=True)
    payment_method  = fields.Str(load_default="cash",
                                 validate=validate.OneOf(
                                     ["cash","free","card","esewa","khalti","fonepay","qr","credit","other",
                                      "stripe","paypal","octopus","room_charge"]))
    folio_booking_id = fields.Int(load_default=None, allow_none=True)
    payment_ref     = fields.Str(load_default=None, allow_none=True)
    discount_pct    = fields.Float(load_default=0.0, validate=validate.Range(min=0, max=30))
    discount_amount = fields.Float(load_default=0.0, validate=validate.Range(min=0))
    tax_pct         = fields.Float(load_default=0.0, validate=validate.Range(min=0, max=100))
    amount_paid     = fields.Float(load_default=None, allow_none=True,
                                   validate=validate.Range(min=0))
    redeem_points   = fields.Int(load_default=0, validate=validate.Range(min=0))
    notes           = fields.Str(load_default=None, allow_none=True,
                                 validate=validate.Length(max=500))


class RefundSchema(Schema):
    class Meta: unknown = EXCLUDE
    amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    reason = fields.Str(required=True, validate=validate.Length(min=3, max=500))


# ── Inventory ─────────────────────────────────────────────────────────────────

class InventoryAdjustSchema(Schema):
    class Meta: unknown = EXCLUDE
    product_id = fields.Int(required=True)
    qty_change  = fields.Int(required=True)   # positive = add, negative = remove
    notes       = fields.Str(load_default="", validate=validate.Length(max=500))


# ── Customers ─────────────────────────────────────────────────────────────────

class CustomerSchema(Schema):
    class Meta: unknown = EXCLUDE
    name   = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    phone  = fields.Str(load_default=None, allow_none=True)
    email  = fields.Email(load_default=None, allow_none=True)
    address= fields.Str(load_default=None, allow_none=True)
    notes  = fields.Str(load_default=None, allow_none=True)


# ── Hospitality ───────────────────────────────────────────────────────────────

class HotelPropertySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    slug = fields.Str(load_default=None, allow_none=True)
    property_type = fields.Str(load_default="hotel")
    address_line1 = fields.Str(load_default=None, allow_none=True)
    address_line2 = fields.Str(load_default=None, allow_none=True)
    city = fields.Str(load_default=None, allow_none=True)
    country = fields.Str(load_default=None, allow_none=True)
    currency_code = fields.Str(load_default="NPR")
    check_in_time = fields.Str(load_default="14:00")
    check_out_time = fields.Str(load_default="11:00")
    hero_image_url = fields.Str(load_default=None, allow_none=True)
    amenities = fields.List(fields.Str(), load_default=list)
    is_default = fields.Bool(load_default=True)


class HotelRoomSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    property_id = fields.Int(required=True)
    room_code = fields.Str(required=True, validate=validate.Length(min=1, max=32))
    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    room_type = fields.Str(load_default=None, allow_none=True)
    max_occupancy = fields.Int(load_default=2, validate=validate.Range(min=1, max=20))
    base_rate = fields.Float(load_default=0, validate=validate.Range(min=0))
    images = fields.List(fields.Str(), load_default=list)
    list_on_bazaar = fields.Bool(load_default=False)
    bazaar_min_nights = fields.Int(load_default=1, validate=validate.Range(min=1, max=30))
    operational_status = fields.Str(load_default=None, allow_none=True)
    housekeeping_status = fields.Str(load_default=None, allow_none=True)


class RoomBlockSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)
    reason = fields.Str(load_default="maintenance")
    notes = fields.Str(load_default=None, allow_none=True)


class RoomRateRuleSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    property_id = fields.Int(required=True)
    room_id = fields.Int(load_default=None, allow_none=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=80))
    rule_type = fields.Str(required=True, validate=validate.OneOf(["multiplier", "fixed", "flash"]))
    value = fields.Float(required=True, validate=validate.Range(min=0.01))
    days_of_week = fields.Str(load_default=None, allow_none=True)
    date_from = fields.Str(load_default=None, allow_none=True)
    date_to = fields.Str(load_default=None, allow_none=True)
    flash_label = fields.Str(load_default=None, allow_none=True)
    priority = fields.Int(load_default=100, validate=validate.Range(min=1, max=999))
    is_active = fields.Bool(load_default=True)


class RoomBookingSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    room_id = fields.Int(required=True)
    guest_name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    guest_email = fields.Email(load_default=None, allow_none=True)
    guest_phone = fields.Str(load_default=None, allow_none=True)
    check_in_date = fields.Str(required=True)
    check_out_date = fields.Str(required=True)
    adults = fields.Int(load_default=1, validate=validate.Range(min=1, max=20))
    children = fields.Int(load_default=0, validate=validate.Range(min=0, max=20))
    source = fields.Str(load_default="walk_in")
    payment_method = fields.Str(load_default=None, allow_none=True)
    amount_paid = fields.Float(load_default=None, allow_none=True)
    notes = fields.Str(load_default=None, allow_none=True)


# ── Finance ───────────────────────────────────────────────────────────────────

class ExpenseSchema(Schema):
    class Meta: unknown = EXCLUDE
    title          = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    category       = fields.Str(load_default="other")
    amount         = fields.Float(required=True, validate=validate.Range(min=0.01))
    payment_method = fields.Str(load_default="cash")
    description    = fields.Str(load_default=None, allow_none=True)
    expense_date   = fields.Str(load_default=None, allow_none=True)


# ── Utility ───────────────────────────────────────────────────────────────────

def validate_request(schema_class):
    """Decorator that validates request JSON against a Marshmallow schema.
    On validation failure returns 422 with field-level error messages.
    On success, injects `validated_data` into the function kwargs.
    """
    from functools import wraps
    from flask import request, jsonify

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            raw = request.get_json(silent=True) or {}
            schema = schema_class()
            errors = schema.validate(raw)
            if errors:
                return jsonify({
                    "error": "Validation failed",
                    "fields": errors
                }), 422
            kwargs["validated"] = schema.load(raw)
            return f(*args, **kwargs)
        return wrapper
    return decorator
