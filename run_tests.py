"""
Standalone Test Runner for AI Audio Lab 2026 4-Tier Verification Suite.
Supports tier filtering (--tier 1,2,3,4), verbose output, and summary reporting.
"""
import sys
import time
import argparse
from pathlib import Path
import pytest

# Set UTF-8 encoding on standard output for safe cross-platform reporting
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure workspace root is in sys.path
WORKSPACE_ROOT = Path(__file__).resolve().parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))


class TestSummaryCollector:
    """Pytest plugin to collect test execution counts and statuses."""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = 0
        self.tests = []

    def pytest_runtest_logreport(self, report):
        if report.when == "call":
            if report.passed:
                self.passed += 1
                self.tests.append((report.nodeid, "PASSED", report.duration))
            elif report.failed:
                self.failed += 1
                self.tests.append((report.nodeid, "FAILED", report.duration))
            elif report.skipped:
                self.skipped += 1
                self.tests.append((report.nodeid, "SKIPPED", report.duration))
        elif report.when == "setup" and report.skipped:
            self.skipped += 1
            self.tests.append((report.nodeid, "SKIPPED", report.duration))
        elif report.failed:
            self.errors += 1
            self.tests.append((report.nodeid, "ERROR", report.duration))


def run_suite(tiers=None, verbose=True, fail_fast=False) -> int:
    """
    Executes test suite with specified tier filters.
    """
    pytest_args = ["-c", str(WORKSPACE_ROOT / "pytest.ini")]
    
    if verbose:
        pytest_args.append("-v")
    if fail_fast:
        pytest_args.append("-x")
        
    # Marker / Path filtering based on tiers
    if tiers and "all" not in tiers:
        markers = [f"tier{t}" for t in tiers]
        pytest_args.extend(["-m", " or ".join(markers)])
    else:
        pytest_args.extend(["-m", "tier1 or tier2 or tier3 or tier4"])
        
    collector = TestSummaryCollector()
    
    print("\n" + "=" * 70)
    print(" AI AUDIO LAB 2026 -- 4-TIER E2E TEST RUNNER")
    print(f" Target Tiers: {tiers if tiers else 'ALL'}")
    print(f" Working Directory: {WORKSPACE_ROOT}")
    print("=" * 70 + "\n")
    
    start_time = time.time()
    exit_code = pytest.main(pytest_args, plugins=[collector])
    duration = time.time() - start_time
    
    total_run = collector.passed + collector.failed + collector.skipped + collector.errors
    
    print("\n" + "=" * 70)
    print(" TEST EXECUTION SUMMARY REPORT")
    print("=" * 70)
    print(f" Total Tests Executed: {total_run}")
    print(f" [PASS] Passed:        {collector.passed}")
    print(f" [FAIL] Failed:        {collector.failed}")
    print(f" [ERR!] Errors:        {collector.errors}")
    print(f" [SKIP] Skipped:       {collector.skipped}")
    print(f" Total Duration:       {duration:.2f} seconds")
    print("=" * 70)
    
    if exit_code == 0:
        print(" RESULT: ALL TESTS PASSED SUCCESSFULLY! (EXIT 0)\n")
    elif exit_code == 5:
        print(" RESULT: NO TESTS WERE COLLECTED / ALL SKIPPED.\n")
        return 0
    else:
        print(f" RESULT: TESTS COMPLETED WITH FAILURES (EXIT CODE {exit_code}).\n")
        
    return exit_code


def main():
    parser = argparse.ArgumentParser(description="AI Audio Lab 2026 Test Runner")
    parser.add_argument(
        "--tier",
        type=str,
        default="all",
        help="Comma-separated tiers to run (e.g. '1', '1,2', '3,4', 'all')"
    )
    parser.add_argument("-v", "--verbose", action="store_true", default=True, help="Verbose output")
    parser.add_argument("-x", "--fail-fast", action="store_true", help="Stop on first failure")
    
    args = parser.parse_args()
    
    if args.tier.lower() == "all":
        tiers = None
    else:
        tiers = [t.strip() for t in args.tier.split(",") if t.strip()]
        
    code = run_suite(tiers=tiers, verbose=args.verbose, fail_fast=args.fail_fast)
    sys.exit(code)


if __name__ == "__main__":
    main()
