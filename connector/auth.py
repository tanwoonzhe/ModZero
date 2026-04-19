"""Access-token verification for incoming proxy requests.

Supports two modes:
  1. JWT verification using JWKS from the controller (default).
  2. Token introspection via POST /auth/introspect on the controller (fallback).
"""

import logging
import time
import aiohttp
import jwt as pyjwt

from config import api_url, get_ssl_context

logger = logging.getLogger("modzero.connector")

# Cache JWKS keys
_jwks_cache: dict = {}
_jwks_fetched_at: float = 0
JWKS_CACHE_TTL = 300  # 5 minutes


async def _fetch_jwks(jwks_url: str) -> dict:
    """Fetch JWKS from the controller's well-known endpoint."""
    global _jwks_cache, _jwks_fetched_at

    if _jwks_cache and (time.time() - _jwks_fetched_at) < JWKS_CACHE_TTL:
        return _jwks_cache

    ssl_ctx = get_ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    try:
        async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(jwks_url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    _jwks_cache = data
                    _jwks_fetched_at = time.time()
                    return data
                else:
                    logger.warning("JWKS fetch failed: HTTP %d", resp.status)
    except Exception as exc:
        logger.warning("JWKS fetch error: %s", exc)
    return _jwks_cache  # return stale cache if available


async def verify_access_token(token: str, policy_store: dict) -> dict | None:
    """Verify a short-lived access token.

    Returns the decoded payload if valid, or None if invalid/expired.
    """
    jwks_url = policy_store.get("jwks_url", "")

    if jwks_url:
        return await _verify_jwt(token, jwks_url)
    else:
        return await _introspect_token(token)


async def _verify_jwt(token: str, jwks_url: str) -> dict | None:
    """Verify JWT using JWKS public keys."""
    jwks = await _fetch_jwks(jwks_url)
    if not jwks or "keys" not in jwks:
        logger.warning("No JWKS keys available, falling back to introspect")
        return await _introspect_token(token)

    try:
        # Get the key id from the token header
        unverified_header = pyjwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find the matching key
        key_data = None
        for key in jwks["keys"]:
            if key.get("kid") == kid or not kid:
                key_data = key
                break

        if not key_data:
            logger.warning("No matching JWKS key for kid=%s", kid)
            return None

        # For HMAC-based JWTs (HS256), use the symmetric key
        algorithm = unverified_header.get("alg", "HS256")
        if algorithm.startswith("HS"):
            # Symmetric — use the 'k' value
            secret = key_data.get("k", "")
            payload = pyjwt.decode(token, secret, algorithms=[algorithm])
        else:
            # RSA/EC — construct public key
            public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            payload = pyjwt.decode(token, public_key, algorithms=[algorithm])

        return payload

    except pyjwt.ExpiredSignatureError:
        logger.debug("Access token expired")
        return None
    except pyjwt.InvalidTokenError as exc:
        logger.debug("Invalid access token: %s", exc)
        return None


async def _introspect_token(token: str) -> dict | None:
    """Verify token via controller introspection endpoint."""
    ssl_ctx = get_ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    try:
        async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=10)) as session:
            url = api_url("/auth/introspect")
            async with session.post(url, json={"token": token}) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("active"):
                        return data
                    return None
                else:
                    logger.warning("Token introspect failed: HTTP %d", resp.status)
                    return None
    except Exception as exc:
        logger.warning("Token introspect error: %s", exc)
        return None
