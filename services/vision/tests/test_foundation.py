import unittest


class VisionFoundationTests(unittest.TestCase):
    def test_environment_has_no_model_dependency(self) -> None:
        import beautiful_chaos_vision

        self.assertTrue(beautiful_chaos_vision.__doc__)


if __name__ == "__main__":
    unittest.main()
