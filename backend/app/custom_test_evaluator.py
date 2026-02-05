"""
Custom Test Evaluator

This module provides evaluation logic for custom security tests that use
Microsoft Graph API queries. It supports various operators for comparing
API responses against expected values.
"""

from typing import Any, Dict, List, Optional, Union
from enum import Enum
import re
import logging

logger = logging.getLogger(__name__)


class GraphQueryOperator(str, Enum):
    """Supported operators for Graph API query evaluation."""
    EXISTS = "exists"
    NOT_EMPTY = "not_empty"
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    COUNT_GT = "count_gt"
    COUNT_LT = "count_lt"
    COUNT_EQ = "count_eq"
    ALL_MATCH = "all_match"
    ANY_MATCH = "any_match"


class EvaluationResult:
    """Result of evaluating a custom test."""
    
    def __init__(
        self,
        passed: bool,
        result: str,  # "passed", "failed", "investigate"
        details: str,
        raw_data: Any = None,
        evaluated_value: Any = None,
    ):
        self.passed = passed
        self.result = result
        self.details = details
        self.raw_data = raw_data
        self.evaluated_value = evaluated_value
    
    def to_dict(self) -> Dict:
        return {
            "passed": self.passed,
            "result": self.result,
            "details": self.details,
            "evaluatedValue": self.evaluated_value,
        }


def get_nested_value(data: Any, path: str) -> Any:
    """
    Get a nested value from a dictionary using dot notation.
    Supports array indexing with [n] syntax.
    
    Examples:
        - "value" -> data["value"]
        - "value[0]" -> data["value"][0]
        - "value[0].state" -> data["value"][0]["state"]
        - "@odata.count" -> data["@odata.count"]
    """
    if not path:
        return data
    
    current = data
    # Parse path segments, handling both dots and array brackets
    segments = re.split(r'\.(?![^\[]*\])', path)
    
    for segment in segments:
        if current is None:
            return None
        
        # Check for array indexing
        array_match = re.match(r'^(\w+)\[(\d+)\]$', segment)
        if array_match:
            key = array_match.group(1)
            index = int(array_match.group(2))
            if isinstance(current, dict) and key in current:
                arr = current[key]
                if isinstance(arr, list) and len(arr) > index:
                    current = arr[index]
                else:
                    return None
            else:
                return None
        elif isinstance(current, dict):
            current = current.get(segment)
        elif isinstance(current, list) and segment.isdigit():
            index = int(segment)
            if len(current) > index:
                current = current[index]
            else:
                return None
        else:
            return None
    
    return current


def evaluate_graph_response(
    response: Dict[str, Any],
    config: Dict[str, Any],
) -> EvaluationResult:
    """
    Evaluate a Microsoft Graph API response against the configured criteria.
    
    Args:
        response: The raw API response from Microsoft Graph
        config: Configuration containing:
            - expectedField: The field path to evaluate (e.g., "value", "value[0].state")
            - operator: The comparison operator
            - value: The expected value (for operators that need it)
    
    Returns:
        EvaluationResult with pass/fail status and details
    """
    try:
        expected_field = config.get("expectedField", "value")
        operator = config.get("operator", "exists")
        expected_value = config.get("value", "")
        
        # Get the value to evaluate
        evaluated_value = get_nested_value(response, expected_field)
        
        logger.info(f"Evaluating: field={expected_field}, operator={operator}, expected={expected_value}, actual={evaluated_value}")
        
        # Apply operator
        if operator == GraphQueryOperator.EXISTS:
            passed = evaluated_value is not None
            details = f"Resource {'exists' if passed else 'does not exist'}"
        
        elif operator == GraphQueryOperator.NOT_EMPTY:
            if isinstance(evaluated_value, list):
                passed = len(evaluated_value) > 0
                details = f"Collection has {len(evaluated_value)} items"
            elif isinstance(evaluated_value, str):
                passed = len(evaluated_value.strip()) > 0
                details = f"Value is {'not empty' if passed else 'empty'}"
            elif evaluated_value is None:
                passed = False
                details = "Value is null/missing"
            else:
                passed = True
                details = f"Value exists: {type(evaluated_value).__name__}"
        
        elif operator == GraphQueryOperator.EQUALS:
            if isinstance(evaluated_value, bool):
                expected_bool = expected_value.lower() in ('true', '1', 'yes')
                passed = evaluated_value == expected_bool
            elif isinstance(evaluated_value, (int, float)):
                try:
                    passed = evaluated_value == float(expected_value)
                except ValueError:
                    passed = str(evaluated_value) == expected_value
            else:
                passed = str(evaluated_value).lower() == str(expected_value).lower()
            details = f"Value '{evaluated_value}' {'equals' if passed else 'does not equal'} expected '{expected_value}'"
        
        elif operator == GraphQueryOperator.NOT_EQUALS:
            if isinstance(evaluated_value, bool):
                expected_bool = expected_value.lower() in ('true', '1', 'yes')
                passed = evaluated_value != expected_bool
            elif isinstance(evaluated_value, (int, float)):
                try:
                    passed = evaluated_value != float(expected_value)
                except ValueError:
                    passed = str(evaluated_value) != expected_value
            else:
                passed = str(evaluated_value).lower() != str(expected_value).lower()
            details = f"Value '{evaluated_value}' {'does not equal' if passed else 'equals'} '{expected_value}'"
        
        elif operator == GraphQueryOperator.CONTAINS:
            if isinstance(evaluated_value, str):
                passed = expected_value.lower() in evaluated_value.lower()
                details = f"Value {'contains' if passed else 'does not contain'} '{expected_value}'"
            elif isinstance(evaluated_value, list):
                passed = expected_value in evaluated_value
                details = f"Array {'contains' if passed else 'does not contain'} '{expected_value}'"
            else:
                passed = False
                details = f"Cannot check 'contains' on type {type(evaluated_value).__name__}"
        
        elif operator == GraphQueryOperator.COUNT_GT:
            if isinstance(evaluated_value, list):
                count = len(evaluated_value)
                threshold = int(expected_value)
                passed = count > threshold
                details = f"Count {count} is {'>' if passed else '<='} {threshold}"
            else:
                passed = False
                details = f"Cannot count non-array value"
        
        elif operator == GraphQueryOperator.COUNT_LT:
            if isinstance(evaluated_value, list):
                count = len(evaluated_value)
                threshold = int(expected_value)
                passed = count < threshold
                details = f"Count {count} is {'<' if passed else '>='} {threshold}"
            else:
                passed = False
                details = f"Cannot count non-array value"
        
        elif operator == GraphQueryOperator.COUNT_EQ:
            if isinstance(evaluated_value, list):
                count = len(evaluated_value)
                threshold = int(expected_value)
                passed = count == threshold
                details = f"Count {count} {'equals' if passed else 'does not equal'} {threshold}"
            else:
                passed = False
                details = f"Cannot count non-array value"
        
        elif operator == GraphQueryOperator.ALL_MATCH:
            # For ALL_MATCH, expected_value should be "field:value" format
            if isinstance(evaluated_value, list):
                if len(evaluated_value) == 0:
                    passed = True
                    details = "Empty array (vacuously true)"
                else:
                    match_parts = expected_value.split(":", 1)
                    if len(match_parts) == 2:
                        match_field, match_value = match_parts
                        matched = [item for item in evaluated_value if get_nested_value(item, match_field) == match_value]
                        passed = len(matched) == len(evaluated_value)
                        details = f"{len(matched)}/{len(evaluated_value)} items have {match_field}={match_value}"
                    else:
                        passed = False
                        details = "Invalid ALL_MATCH format. Use 'field:value'"
            else:
                passed = False
                details = "Cannot use ALL_MATCH on non-array value"
        
        elif operator == GraphQueryOperator.ANY_MATCH:
            # For ANY_MATCH, expected_value should be "field:value" format
            if isinstance(evaluated_value, list):
                if len(evaluated_value) == 0:
                    passed = False
                    details = "Empty array - no matches possible"
                else:
                    match_parts = expected_value.split(":", 1)
                    if len(match_parts) == 2:
                        match_field, match_value = match_parts
                        matched = [item for item in evaluated_value if str(get_nested_value(item, match_field)).lower() == match_value.lower()]
                        passed = len(matched) > 0
                        details = f"Found {len(matched)} items with {match_field}={match_value}"
                    else:
                        passed = False
                        details = "Invalid ANY_MATCH format. Use 'field:value'"
            else:
                passed = False
                details = "Cannot use ANY_MATCH on non-array value"
        
        else:
            passed = False
            details = f"Unknown operator: {operator}"
        
        # Determine result status
        if passed:
            result = "passed"
        else:
            # Some operators might want "investigate" instead of "failed"
            result = "failed"
        
        return EvaluationResult(
            passed=passed,
            result=result,
            details=details,
            raw_data=response,
            evaluated_value=evaluated_value,
        )
    
    except Exception as e:
        logger.exception(f"Error evaluating Graph response: {e}")
        return EvaluationResult(
            passed=False,
            result="investigate",
            details=f"Evaluation error: {str(e)}",
            raw_data=response,
            evaluated_value=None,
        )


def evaluate_checklist(
    config: Dict[str, Any],
) -> EvaluationResult:
    """
    Evaluate a checklist configuration.
    
    Args:
        config: Configuration containing:
            - requireAll: Whether all items must be checked
            - items: List of checklist items with 'checked' status
    
    Returns:
        EvaluationResult with pass/fail status
    """
    try:
        require_all = config.get("requireAll", True)
        items = config.get("items", [])
        
        if not items:
            return EvaluationResult(
                passed=False,
                result="investigate",
                details="No checklist items defined",
                evaluated_value=None,
            )
        
        checked_count = sum(1 for item in items if item.get("checked", False))
        total_count = len(items)
        
        if require_all:
            passed = checked_count == total_count
            details = f"Checklist: {checked_count}/{total_count} items completed (all required)"
        else:
            passed = checked_count > 0
            details = f"Checklist: {checked_count}/{total_count} items completed (any required)"
        
        result = "passed" if passed else "failed"
        
        return EvaluationResult(
            passed=passed,
            result=result,
            details=details,
            evaluated_value={"checked": checked_count, "total": total_count},
        )
    
    except Exception as e:
        logger.exception(f"Error evaluating checklist: {e}")
        return EvaluationResult(
            passed=False,
            result="investigate",
            details=f"Checklist evaluation error: {str(e)}",
            evaluated_value=None,
        )
