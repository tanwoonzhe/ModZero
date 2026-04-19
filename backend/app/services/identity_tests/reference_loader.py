"""Reference metadata loader for identity tests.

Provides a layered approach to loading rich test metadata:
1. Auto-extracted data from Microsoft Zero Trust Assessment (test_reference_data.json)
2. Manual overrides for missing/custom fields (reference_overrides.json)

The combined data is exposed via get_reference(test_id) and get_all_references().
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_THIS_DIR = Path(__file__).resolve().parent
_REFERENCE_FILE = _THIS_DIR / "test_reference_data.json"
_OVERRIDES_FILE = _THIS_DIR / "reference_overrides.json"

# Cached data
_reference_data: Optional[Dict[str, Any]] = None


def _load() -> Dict[str, Any]:
    """Load and merge reference data + overrides. Cached after first call."""
    global _reference_data
    if _reference_data is not None:
        return _reference_data

    # Layer 1: auto-extracted reference data
    base: Dict[str, Any] = {}
    if _REFERENCE_FILE.exists():
        try:
            with open(_REFERENCE_FILE, "r", encoding="utf-8") as f:
                base = json.load(f)
            logger.info("Loaded %d test references from %s", len(base), _REFERENCE_FILE.name)
        except Exception as e:
            logger.warning("Failed to load reference data: %s", e)

    # Layer 2: manual overrides (merged on top)
    if _OVERRIDES_FILE.exists():
        try:
            with open(_OVERRIDES_FILE, "r", encoding="utf-8") as f:
                overrides = json.load(f)
            for test_id, override_fields in overrides.items():
                if test_id.startswith("_"):
                    continue  # skip metadata keys like _comment
                if not isinstance(override_fields, dict):
                    continue
                if test_id in base:
                    base[test_id].update(override_fields)
                    base[test_id]["_has_overrides"] = True
                else:
                    override_fields["_has_overrides"] = True
                    base[test_id] = override_fields
            logger.info("Applied overrides for %d tests", len(overrides))
        except Exception as e:
            logger.warning("Failed to load overrides: %s", e)

    # Clean up internal extraction flags for the API output
    for entry in base.values():
        entry.pop("_md_loaded", None)
        entry.pop("_ps1_loaded", None)

    _reference_data = base
    return _reference_data


def get_reference(test_id: str) -> Optional[Dict[str, Any]]:
    """Get reference metadata for a single test. Returns None if not found."""
    data = _load()
    return data.get(test_id)


def get_all_references() -> Dict[str, Any]:
    """Get all reference metadata keyed by test_id."""
    return _load()


def get_reference_for_result(test_id: str) -> Dict[str, Any]:
    """Build a reference object suitable for inclusion in API responses.

    Returns a clean subset of fields for the frontend to display.
    Falls back to sensible defaults when data is missing.
    """
    ref = get_reference(test_id)
    if not ref:
        return {
            "category": "",
            "pillar": "Identity",
            "risk": "",
            "user_impact": "",
            "implementation_cost": "",
            "description": "",
            "why_it_matters": "",
            "remediation_action": "",
            "source_endpoints": [],
            "reference_source": "no reference data available",
        }

    description = ref.get("description", "")
    # Split description: first paragraph = "why it matters" context,
    # remaining paragraphs = additional detail
    paragraphs = [p.strip() for p in description.split("\n\n") if p.strip()]
    why_it_matters = paragraphs[0] if paragraphs else ""
    what_was_checked = paragraphs[1] if len(paragraphs) > 1 else ""

    # Override with manual fields if provided
    why_override = ref.get("why_it_matters_override", "")
    what_override = ref.get("what_was_checked_override", "")
    if why_override:
        why_it_matters = why_override
    if what_override:
        what_was_checked = what_override

    source_label = "Microsoft Zero Trust Assessment (auto-extracted)"
    if ref.get("_has_overrides"):
        source_label += " + manual overrides"

    return {
        "category": ref.get("category", ""),
        "pillar": ref.get("pillar", "Identity"),
        "risk": ref.get("risk", ""),
        "user_impact": ref.get("user_impact", ""),
        "implementation_cost": ref.get("implementation_cost", ""),
        "description": description,
        "why_it_matters": why_it_matters,
        "what_was_checked": what_was_checked,
        "remediation_action": ref.get("remediation_action", ""),
        "source_endpoints": ref.get("source_endpoints", []),
        "reference_source": source_label,
    }
