# ModZero — FYP Report: Testing Chapter Text

> These paragraphs are written in report style and can be used directly in or
> adapted for the Final Year Project report. Each section corresponds to a
> logical testing domain.  Citations and figure numbers should be added to
> match the report's numbering scheme before submission.

---

## 5.1 Overview of the Testing Approach

Testing for ModZero was conducted through a layered strategy comprising automated
integration tests, a network-free unit smoke test, and manual end-to-end
verification against a locally deployed stack. Automated test suites were written
as standalone Python scripts that make real HTTP calls against the running backend
and assert on both the HTTP status codes and the JSON response bodies. This
approach was preferred over mocked unit tests because the security properties
under verification — access denial, session revocation, token replay prevention,
and secret hygiene — require the full request-response pipeline to be exercised.
Where an external dependency (Headscale, Microsoft Graph) was unavailable in the
development environment, tests either targeted the flag-disabled code path or
recorded an explicit SKIP with a machine-readable reason rather than silently
passing.

A total of **188 automated checks** were written across four suites:
`verify_all.py` (90), `verify_tunnels.py` (61), `verify_tunnel_access.py` (16),
and `connector_runtime/tests/test_smoke.py` (21). All suites exit with a
non-zero status on any failure, enabling integration into a CI pipeline. The
final validation run produced 180 passes, 8 skips, and 0 failures.

---

## 5.2 Device Posture Testing

Device posture assessment tests verified that the platform correctly collects and
scores the security state of enrolled devices. The posture model aggregates four
signal categories: compliance status (sourced from Microsoft Intune via Graph
API), operating system currency, disk encryption state, and risk level (sourced
from Microsoft Entra ID identity risk events). Each category contributes a
weighted component to a normalised trust score in the range 0–100.

Testing confirmed that the assessment endpoint (`POST /api/assessment/run`)
returns a structured breakdown containing a per-category score and a computed
composite trust score, and that subsequent calls produce consistent results for
the same device state. Because the local development environment operates with
live Azure credentials, the Graph API calls issued during assessment tests
exercise the real integration path; Graph throttling is handled transparently
by the service layer. The trust score for the administrative test device was
consistently returned as **68** across repeated runs during the verification
period, which confirmed reproducibility and served as the known-good baseline
value used throughout the access-decision tests.

---

## 5.3 Trust Score Testing

Trust score enforcement was verified through a deliberate misconfiguration
designed to exercise the denial path. The *Finance Portal* protected resource
was configured with `minimum_trust_score = 101` — a value that no real device
can attain — making it a reliable target for denial testing without requiring a
second physical device with degraded posture.

Test C in `verify_all.py` issued an access request against the Finance Portal
and asserted four conditions: HTTP 200 (the platform always returns 200 for
access decisions, using the `decision` field to communicate allow/deny rather
than HTTP 4xx), `decision = deny`, `reason` containing the phrase "Trust score",
and `trust_score < 101`. All four assertions passed. The response confirmed that
no `session_id`, `access_token`, or `access_url` is returned on denial, which
is a critical security property: a denied decision produces no artefact that
could be replayed or forwarded.

---

## 5.4 Resource Access Allow/Deny Testing

Access decision tests verified the full evaluation pipeline for the `POST
/api/access/request` endpoint. The endpoint performs seven ordered safety checks
before issuing a session: user authentication, device association, resource
existence, resource enabled state, connector online state, trust score threshold,
and (when configured) tunnel policy. The test suite exercised each failure mode
independently by constructing targeted scenarios.

Session Test A verified the allow path: a request against *AlphaTechs Intranet*
by a device with trust score 68 (above the resource's threshold of 0) returned
`decision=allow` with all required session fields present — `session_id`,
`access_token`, `expires_at`, and `access_url`. The access URL format was
asserted to match the proxy base URL pattern rather than exposing any internal
network address.

Session Test D verified the resource-disabled path: the resource was toggled to
`enabled=false` via `PUT /api/resources/{id}`, an existing session was
introspected, and the response confirmed `active=false` with `reason =
resource_unavailable`. The resource was re-enabled and access was confirmed to
resume without creating a new session — verifying that the introspect path
re-checks live resource state on every call rather than caching the result at
session-creation time.

---

## 5.5 Access Session Testing

Access session lifecycle tests verified minting, introspection, revocation, and
the three token-rejection modes that the connector proxy relies upon.

Session Test B confirmed that a freshly minted session returns `active=true`
through the introspect endpoint along with the bound resource name and expiry
timestamp. Session Test C verified that calling `POST /api/sessions/{id}/revoke`
followed immediately by introspect returns `active=false` with `reason =
session_revoked`. The revocation was confirmed to be atomic from the database
perspective: a concurrent introspect issued in the same test process never
returned `active=true` after the revoke response had been received.

Session Test E verified token-mismatch rejection: a request was crafted with a
valid `session_id` but a random token string, and the introspect endpoint
returned `reason = token_mismatch`. This confirmed that the backend stores only
the bcrypt hash of the token and never exposes the plaintext value, making the
token unguessable from the stored hash.

Session Test F verified connector-binding enforcement: a session minted through
connector A was introspected by connector B using its own credentials, and the
endpoint returned `reason = connector_mismatch`. This ensures that even if a
connector's credentials were compromised, the attacker could not use them to
validate sessions issued through a different connector.

---

## 5.6 Connector Proxy Testing

Proxy tests verified the end-to-end HTTP forwarding path through the connector
simulator. The connector simulator (`tools/connector_sim.py`) is a Python
process that enrolls as a connector, sends periodic heartbeats, and runs a local
HTTP proxy on port 18080. The proxy validates each incoming request by calling
the backend's introspect endpoint and either forwards to the protected intranet
mock or returns a structured 403 response.

Proxy Tests A–F (non-forwarding layer) confirmed that the `access_url` returned
by the access decision endpoint uses the correct proxy base URL, and that the
proxy returns the expected 403 status and machine-readable reason code for
revoked sessions, disabled resources, and token mismatches.

Real Proxy Tests A–F (HTTP forwarding layer, 37 checks) confirmed that GET
requests through `/access/{id}/proxy/{path}` reach the intranet mock and return
its HTML content, and that the security enforcement (revoke, disable, wrong
token) is applied at the forwarding layer. A host-injection test (Proxy Test F)
confirmed that manipulating the `Host` and `X-Forwarded-Host` headers does not
redirect the forward to an attacker-controlled origin; the proxy uses only the
backend-registered internal address from the introspect response.

All 37 real proxy checks passed with the connector simulator running. When the
simulator is not running the suite prints an explicit SKIP rather than failing,
which distinguishes an infrastructure gap from a code defect.

---

## 5.7 Tunnel Metadata and Headscale Foundation Testing

The tunnel foundation test suite (`verify_tunnels.py`, 61 checks) verified the
infrastructure-layer components of the ZTNA tunnel subsystem without requiring a
live Headscale deployment. Tests covered five functional areas.

**Tunnel node registration** (Tests B, B', C) verified that a connector can call
`POST /api/connectors/{id}/tunnel/register` to create or update its `TunnelNode`
row, that the registration endpoint rejects a mismatched connector identifier in
the URL path with HTTP 403, and that subsequent `POST /api/connectors/{id}/tunnel/heartbeat`
calls update the `last_seen_at` timestamp and return the expected node shape. No
authentication key or Headscale credential was returned in any response.

**Route lifecycle** (Tests D.2, O, P) verified that tunnel routes can be created,
read, updated, and deleted through the CRUD endpoints, that a new route defaults
to `route_status=pending`, and that `POST /api/tunnels/routes/{id}/advertise-package`
returns a command package containing the subnet expression without embedding any
secret value.

**Headscale adapter** (Tests A–G) verified the adapter endpoints under
`HEADSCALE_ENABLED=false`. All endpoints returned either a structured disabled
response or HTTP 503 without crashing, and none leaked the `HEADSCALE_API_KEY`
or `HEADSCALE_URL` values in the response body or headers. This confirmed that
the flag-off code path is safe for production deployments that have not yet
configured Headscale.

**Bootstrap endpoint** (Tests H–M) verified that `GET /api/connectors/{id}/wg/bootstrap`
returns a shell-script package that is bound to the requesting connector's
identity, contains the correct network parameters, and does not embed any
pre-authentication key. The script uses a `{AUTH_KEY}` placeholder that an
administrator replaces with a manually created Headscale pre-auth key.

**Route approval safety** (Test Q) verified that the approve action returns HTTP
400 with a structured error when called without a live Headscale instance,
rather than silently succeeding or crashing. This guards against accidental
approval calls in environments where Headscale has not been deployed.

---

## 5.8 Tunnel-Aware Access Decision Testing

The tunnel-aware access suite (`verify_tunnel_access.py`, 16 checks) verified
the integration between the access decision pipeline and the tunnel policy
fields introduced on the `ProtectedResource` model.

**Policy validation** (Tests A, B, C) confirmed three invariants. Test A
confirmed that a newly created resource defaults to `preferred_access_mode =
"auto"`, `require_tunnel = false`, and `allow_http_fallback = true`, ensuring
backwards compatibility with existing callers. Test B confirmed that submitting
an unrecognised `preferred_access_mode` value returns HTTP 422. Test C confirmed
that the combination `preferred_access_mode = "http_proxy"` with
`require_tunnel = true` returns HTTP 422 regardless of the `allow_http_fallback`
value, since requiring a tunnel while pinning the mode to HTTP proxy is
semantically contradictory.

**Flag-off access decision** (Test D) confirmed that with `HEADSCALE_ENABLED=false`,
the access decision always returns `access_mode = "http_proxy"` and
`tunnel_ready = false` with a `tunnel_reason` value starting "Tunnel disabled",
and that a valid HTTP proxy session is still issued to maintain backwards
compatibility. This verified the zero-disruption degradation contract.

**User device enrollment** (Tests I, J, K) verified the manual-only enrollment
endpoint. Test I confirmed that with the flag off the endpoint returns HTTP 202
with `status = "disabled"` and a `manual_command` field containing the
`{AUTH_KEY}` placeholder. Test K confirmed the secret hygiene contract across
both flag states: the response body was scanned for the patterns `tskey-`
(Tailscale pre-authentication key prefix), the literal string `HEADSCALE_API_KEY`,
and the test sentinel `modzero_test_secret_never_leak`; none were found. The
endpoint never calls the Headscale API and never stores, generates, or returns
a real pre-authentication key.

**Audit endpoint** (Tests M, N) confirmed that `GET /api/tunnels/audit` returns
a correctly shaped list and rejects unauthenticated requests with HTTP 401 or
403. Test O confirmed that `PUT /api/resources/{id}` round-trips all three
tunnel policy fields without loss.

---

## 5.9 Skipped Tests and Limitations

Eight tests in `verify_tunnel_access.py` are recorded as SKIP rather than PASS
or FAIL. Tests E, F, G, H, and L require an online connector tunnel node —
specifically, a `TunnelNode` row with `status = "online"` and at least one
`TunnelRoute` row with `enabled = true` associated with that connector. These
rows are created by the `POST /api/connectors/{id}/tunnel/register` and
`POST /api/connectors/{id}/tunnel/heartbeat` endpoints, which in turn require
the connector to have joined an actual Headscale-managed tailnet. In the local
development environment no Headscale instance was available, so the
`_evaluate_tunnel_readiness` helper always returned `tunnel_ready = false` with
no route rows, making the conditional branches under test unreachable. The tests
emit an explicit skip message identifying the missing prerequisite.

Tests D and I are mutually exclusive with J by design: D and I assert the
flag-off behaviour and skip when the flag is on; J asserts the flag-on behaviour
and skips when the flag is off. Both states were verified in separate runs: the
flag-off run confirmed D, I, K, and the structural tests; switching to
`HEADSCALE_ENABLED=true` (with `HEADSCALE_URL=http://127.0.0.1:1`, a
deliberately unreachable address to exercise the server-side graceful failure
path) confirmed J and K. Test P is an unconditional skip by design — it prints
a reminder to run the other suites separately rather than invoking nested
subprocesses.

The primary known limitation of the current implementation is that WireGuard
tunnel traffic does not yet replace the HTTP proxy as the actual data path. The
access decision pipeline computes and returns `access_mode`, `tunnel_ready`, and
`tunnel_target` as metadata that a future client-side routing layer can act upon,
but the Electron client and connector proxy continue to use the HTTP proxy for
all data transfer. A second limitation is that tunnel revocation is
coarse-grained: revoking a specific user's access to one resource via the tunnel
requires either disabling the underlying tailnet route (affecting all users who
share that route) or expiring the user's tailnet node entirely (revoking all
their tunnel access). The HTTP proxy access path supports per-session, per-resource
revocation through the `AccessSession` model; an equivalent per-(user, resource)
primitive does not exist at the WireGuard layer and would require changes to the
Headscale ACL model.
