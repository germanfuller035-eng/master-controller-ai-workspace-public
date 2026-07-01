import unittest

from tools.policies.payload_hash import PayloadHashError, calculate_payload_hash


def payload(**overrides):
    data = {
        "actor": "owner",
        "action": "outbound_send",
        "target": "lead:123",
        "payload": {"recipient": "lead@example.test", "amount": 10},
        "risk": "R4",
        "expiry": "2099-01-01T00:00:00Z",
        "task_id": "task-1",
    }
    data.update(overrides)
    return data


class PayloadHashTests(unittest.TestCase):
    def test_same_payload_same_hash(self):
        self.assertEqual(calculate_payload_hash(payload()), calculate_payload_hash(payload()))

    def test_reordered_json_same_hash(self):
        first = payload(payload={"recipient": "lead@example.test", "amount": 10})
        second = payload(payload={"amount": 10, "recipient": "lead@example.test"})
        self.assertEqual(calculate_payload_hash(first), calculate_payload_hash(second))

    def test_changed_recipient_changes_hash(self):
        self.assertNotEqual(
            calculate_payload_hash(payload()),
            calculate_payload_hash(payload(payload={"recipient": "other@example.test", "amount": 10})),
        )

    def test_changed_amount_changes_hash(self):
        self.assertNotEqual(
            calculate_payload_hash(payload()),
            calculate_payload_hash(payload(payload={"recipient": "lead@example.test", "amount": 11})),
        )

    def test_changed_action_changes_hash(self):
        self.assertNotEqual(calculate_payload_hash(payload()), calculate_payload_hash(payload(action="publish_external")))

    def test_missing_field_fails(self):
        data = payload()
        del data["actor"]
        with self.assertRaises(PayloadHashError):
            calculate_payload_hash(data)

    def test_unknown_volatile_field_does_not_silently_disappear(self):
        with self.assertRaisesRegex(PayloadHashError, "not allowlisted"):
            calculate_payload_hash(payload(), exclude_fields=["unknown_nonce"])

    def test_allowlisted_volatile_field_can_be_excluded(self):
        first = payload(request_id="abc")
        second = payload(request_id="def")
        self.assertEqual(
            calculate_payload_hash(first, exclude_fields=["request_id"]),
            calculate_payload_hash(second, exclude_fields=["request_id"]),
        )

    def test_secret_looking_value_not_printed_in_error(self):
        data = payload(payload={"token": "FAKE_TOKEN_VALUE_DO_NOT_USE"})
        del data["action"]
        try:
            calculate_payload_hash(data)
        except PayloadHashError as exc:
            self.assertNotIn("FAKE_TOKEN_VALUE_DO_NOT_USE", str(exc))
        else:
            self.fail("PayloadHashError not raised")


if __name__ == "__main__":
    unittest.main()
