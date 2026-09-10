"""Validate the Epic 1 SM-1 coverage manifest without third-party dependencies."""

from __future__ import annotations

import json
import sys
from pathlib import Path


EXPECTED_SECTIONS = {f"S{i}" for i in range(1, 17)}
ALLOWED_STATUSES = {"covered", "missing", "not_implemented", "inapplicable"}
REQUIRED_AUDIENCE_PATHS = {
    ("self", "self"),
    ("reporting_line", "direct_report"),
    ("reporting_line", "two_levels_up"),
    ("reporting_line", "department_manager"),
    ("project_line", "pm_project"),
    ("project_line", "dm_project"),
    ("people_partner", "assigned_pp"),
    ("people_partner", "pp_hr_line"),
    ("colleague", "no_relationship"),
    ("full_profile_access", "grant_without_relationship"),
}


def repository_root() -> Path:
    return Path(__file__).resolve().parents[4]


def evidence_exists(evidence: str) -> bool:
    path_text, separator, marker = evidence.partition("::")
    if not separator or not path_text or not marker:
        return False
    evidence_path = repository_root() / path_text
    return evidence_path.is_file() and marker in evidence_path.read_text(encoding="utf-8")


def main() -> int:
    manifest_path = Path(__file__).with_name("sm1-coverage-manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    if manifest.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if manifest.get("manifest") != "SM-1":
        errors.append("manifest must be SM-1")

    sections = manifest.get("sections", {})
    if set(sections) != EXPECTED_SECTIONS:
        errors.append("sections must contain exactly S1 through S16")
    invalid_section_statuses = {
        section: status
        for section, status in sections.items()
        if status not in {"implemented", "not_implemented", "inapplicable"}
    }
    if invalid_section_statuses:
        errors.append(f"invalid section statuses: {invalid_section_statuses}")

    covered_audience_paths: set[tuple[str, str]] = set()
    declared_gap_audience_paths: set[tuple[str, str]] = set()
    for index, case in enumerate(manifest.get("cases", [])):
        audience = case.get("audience")
        relationship_path = case.get("relationshipPath")
        status = case.get("status")
        if not audience or not relationship_path:
            errors.append(
                f"cases[{index}] must declare audience and relationshipPath"
            )
        if status not in ALLOWED_STATUSES:
            errors.append(f"cases[{index}] has invalid status: {status}")
        case_sections = set(case.get("sections", []))
        if status == "covered" and not case_sections:
            errors.append(f"cases[{index}] marked covered without sections")
        if not case_sections <= EXPECTED_SECTIONS:
            errors.append(f"cases[{index}] contains an unknown section")
        if status == "covered" and not case.get("evidence"):
            errors.append(f"cases[{index}] marked covered without evidence")
        if status == "covered" and not evidence_exists(case["evidence"]):
            errors.append(f"cases[{index}] cites missing or unrecognized evidence")
        if status == "covered":
            covered_audience_paths.add((audience, relationship_path))
        if "shared_link" in {case.get("audience"), case.get("relationshipPath")}:
            errors.append("shared-link coverage must not be claimed in SM-1")

    for index, gap in enumerate(manifest.get("gaps", [])):
        if gap.get("status") not in {"missing", "not_implemented", "inapplicable"}:
            errors.append(f"gaps[{index}] must explicitly describe a non-covered status")
        if not gap.get("reason"):
            errors.append(f"gaps[{index}] must include a reason")
        audiences = gap.get("audiences", [])
        relationship_paths = gap.get("relationshipPaths", [])
        if not audiences or not relationship_paths:
            errors.append(
                f"gaps[{index}] must declare audiences and relationshipPaths"
            )
        declared_gap_audience_paths.update(
            (audience, relationship_path)
            for audience in audiences
            for relationship_path in relationship_paths
        )

    undeclared_audience_paths = REQUIRED_AUDIENCE_PATHS - (
        covered_audience_paths | declared_gap_audience_paths
    )
    if undeclared_audience_paths:
        errors.append(
            "required audience/path combinations are neither covered nor declared "
            f"as gaps: {sorted(undeclared_audience_paths)}"
        )

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    gaps = [
        gap
        for gap in manifest.get("gaps", [])
        if gap.get("status") in {"missing", "not_implemented"}
    ]
    unimplemented_sections = [
        section
        for section, status in sections.items()
        if status == "not_implemented"
    ]
    print(f"SM-1 manifest schema valid: {len(manifest.get('cases', []))} covered cases recorded.")
    if gaps or unimplemented_sections:
        print(
            "SM-1 incomplete: "
            f"{len(gaps)} explicit gap group(s) and "
            f"{len(unimplemented_sections)} unimplemented section(s) remain."
        )
        for gap in gaps:
            print(f"  - {gap['status']}: {gap['reason']}")
        if unimplemented_sections:
            print(f"  - not_implemented sections: {', '.join(unimplemented_sections)}")
        return 2

    if manifest.get("validation", {}).get("complete") is not True:
        print("ERROR: validation.complete must be true when no coverage gaps remain.")
        return 1

    print("SM-1 complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
