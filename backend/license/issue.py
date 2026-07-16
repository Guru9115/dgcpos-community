#!/usr/bin/env python3
"""Issue Enterprise license keys (operator tooling — private key required).

Never commit DGCPOS_LICENSE_PRIVATE_KEY. Without it this script cannot issue valid licenses.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta

from license.keys import issue_license_key


def main() -> int:
    parser = argparse.ArgumentParser(description="Issue a DGCPOS Enterprise license key")
    parser.add_argument("--customer-id", required=True, help="Merchant / customer reference ID")
    parser.add_argument("--days", type=int, default=365, help="Validity in days (default 365)")
    parser.add_argument("--max-staff", type=int, default=50)
    args = parser.parse_args()

    expires_at = datetime.utcnow() + timedelta(days=max(1, args.days))
    key = issue_license_key(
        customer_id=args.customer_id,
        expires_at=expires_at,
        max_staff=args.max_staff,
    )
    print(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())