"""Store type normalization — hospitality aliases."""
from store_engine import normalize_store_type, get_store_config


def test_normalize_hotel_aliases():
    assert normalize_store_type("Hotel") == "hotel"
    assert normalize_store_type("Lodge") == "hotel"
    assert normalize_store_type("Guesthouse") == "hotel"
    assert normalize_store_type("hostel") == "hotel"
    assert normalize_store_type("Everest Lodge") == "hotel"


def test_hotel_pos_mode():
    cfg = get_store_config("Lodge")
    assert cfg["pos_mode"] == "hospitality"
    assert "room_charge" in cfg.get("features", [])