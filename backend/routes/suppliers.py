from flask import Blueprint, request, jsonify
from flask_login import login_required
from auth_utils import token_required
from models import db, Supplier

suppliers_bp = Blueprint("suppliers", __name__)

@suppliers_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_suppliers():
    suppliers = Supplier.query.order_by(Supplier.name).all()
    return jsonify([s.to_dict() for s in suppliers])

@suppliers_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_supplier():
    data = request.get_json()
    s = Supplier(**{k:data.get(k) for k in ["name","contact","phone","email","address","notes","pan_number","tax_number"]})
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201

@suppliers_bp.route("/<int:sid>", methods=["PUT"])
@token_required
@login_required
def update_supplier(sid):
    s = Supplier.query.get_or_404(sid)
    data = request.get_json()
    for f in ["name","contact","phone","email","address","notes","pan_number","tax_number"]:
        if f in data: setattr(s, f, data[f])
    db.session.commit()
    return jsonify(s.to_dict())

@suppliers_bp.route("/<int:sid>", methods=["DELETE"])
@token_required
@login_required
def delete_supplier(sid):
    s = Supplier.query.get_or_404(sid)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message":"Deleted"})