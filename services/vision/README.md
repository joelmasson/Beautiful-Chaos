# Vision service

This Python project is reserved for future video ingestion, player tracking,
and movement extraction. Screen-to-rink normalization belongs to the planned
TypeScript preprocessing stage, not this service. Computer-vision models and
libraries are intentionally not installed in this foundation slice.

Create a local environment and run the standard-library tests from the
repository root:

```sh
python3 -m venv services/vision/.venv
PYTHONPATH=services/vision/src \
  services/vision/.venv/bin/python -m unittest discover -s services/vision/tests
```

The service should eventually emit extracted observations for TypeScript
preprocessing. That stage will produce normalized movement JSON conforming to
[`packages/contracts`](../../packages/contracts), without transferring
computer-vision responsibilities to the browser. Artistic configuration must
not influence extraction or normalization. See
[creative direction](../../docs/creative-direction.md).
