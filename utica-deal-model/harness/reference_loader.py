"""Load the pinned Python reference model without modifying it.

model.py is imported directly from the pinned clone.

app.py cannot be imported (it executes Streamlit at module level), so the
functions the harness needs are extracted from its source with the ast module
and executed in a controlled namespace.  Extraction is verified strictly:

  * every needed function (and every function it transitively calls) must have
    no decorator other than the exact allow-listed ``st.cache_data(show_spinner=False)``
    (replaced by an identity decorator), no non-constant default argument,
    and no annotations;
  * every module-global symbol referenced anywhere in those functions
    (including nested function scopes) must resolve to an extracted import,
    an extracted literal constant, another extracted function, or a builtin;
  * the streamlit stub ``st`` may not be referenced in any needed function body.

Any violation raises ExtractionError before a single fixture is produced.
"""

from __future__ import annotations

import ast
import builtins
import hashlib
import importlib
import importlib.util
import os
import subprocess
import symtable
import sys
import types
from dataclasses import dataclass, field

# Never write bytecode into the pinned clone; the git-dirty guard would refuse to run.
sys.dont_write_bytecode = True

REPO_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "reference", "Utica-Model-V7")
)

# Functions the harness calls from app.py.  Transitive callees are added
# automatically and verified with the same rules.
NEEDED_APP_FUNCTIONS = [
    "apply_calc_unit_acres",
    "weighted_avg_by_net_acres",
    "weighted_avg_spud_month_by_net_acres",
    "build_sensitivity_range",
    "build_percentage_sensitivity_range",
    "run_two_way_sensitivity",
    "run_individual_slot_returns",
    "build_quarterly_output_table",
    "build_quarterly_output_display_table",
    "build_tc_assumptions_output_display_table",
    "calc_slot_eur_metrics",
    "build_scenario_scatter_chart",
    "build_cumulative_fcf_chart",
    "build_dale_group_audit",
]

ALLOWED_DECORATOR_DUMP = ast.dump(
    ast.parse("st.cache_data(show_spinner=False)", mode="eval").body
)


class ExtractionError(RuntimeError):
    pass


class _StubModule(types.SimpleNamespace):
    """Inert stand-in for streamlit.  Only cache_data is meaningful."""

    def cache_data(self, *args, **kwargs):
        # st.cache_data(show_spinner=False) is used as a decorator factory.
        if args and callable(args[0]) and len(args) == 1 and not kwargs:
            return args[0]

        def identity(fn):
            return fn

        return identity

    def __getattr__(self, name):
        raise ExtractionError(
            f"streamlit stub attribute '{name}' was accessed at definition time"
        )


@dataclass
class ExtractionReport:
    commit_sha: str
    repo_dir: str
    model_file_sha256: str
    app_file_sha256: str
    extracted_functions: list[str] = field(default_factory=list)
    extracted_constants: dict = field(default_factory=dict)
    extracted_imports: list[str] = field(default_factory=list)
    needed_closure: list[str] = field(default_factory=list)
    skipped_top_level_statements: int = 0
    decorator_replacements: list[str] = field(default_factory=list)
    verification: dict = field(default_factory=dict)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_commit_sha(repo_dir: str = REPO_DIR) -> str:
    out = subprocess.run(
        ["git", "-C", repo_dir, "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    sha = out.stdout.strip()
    dirty = subprocess.run(
        ["git", "-C", repo_dir, "status", "--porcelain"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if dirty:
        raise ExtractionError(
            "Reference clone has uncommitted changes; refusing to generate fixtures:\n"
            + dirty
        )
    return sha


def load_pinned_model(repo_dir: str = REPO_DIR):
    """Import model.py from the pinned clone as module name 'model'."""
    if "model" in sys.modules:
        existing = sys.modules["model"]
        if os.path.abspath(getattr(existing, "__file__", "")) != os.path.join(
            repo_dir, "model.py"
        ):
            raise ExtractionError("A different 'model' module is already imported")
        return existing
    spec = importlib.util.spec_from_file_location(
        "model", os.path.join(repo_dir, "model.py")
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["model"] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------
def _is_literal(node: ast.AST) -> bool:
    try:
        ast.literal_eval(node)
        return True
    except Exception:
        return False


def _called_names(fn_node: ast.FunctionDef) -> set[str]:
    names = set()
    for node in ast.walk(fn_node):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            names.add(node.func.id)
        elif isinstance(node, ast.Name):
            names.add(node.id)
    return names


def _global_symbols(table: symtable.SymbolTable) -> set[str]:
    """All symbols resolved as module-global in this scope and nested scopes."""
    out = set()
    for sym in table.get_symbols():
        if sym.is_global() and sym.is_referenced():
            out.add(sym.get_name())
    for child in table.get_children():
        out |= _global_symbols(child)
    return out


def extract_app_functions(repo_dir: str = REPO_DIR) -> tuple[dict, ExtractionReport]:
    app_path = os.path.join(repo_dir, "app.py")
    with open(app_path, "r", encoding="utf-8") as fh:
        source = fh.read()
    tree = ast.parse(source, filename=app_path)

    model = load_pinned_model(repo_dir)
    stub_st = _StubModule()

    namespace: dict = {"__name__": "app_extracted", "__builtins__": builtins}
    report = ExtractionReport(
        commit_sha=git_commit_sha(repo_dir),
        repo_dir=repo_dir,
        model_file_sha256=sha256_file(os.path.join(repo_dir, "model.py")),
        app_file_sha256=sha256_file(app_path),
    )

    func_nodes: dict[str, ast.FunctionDef] = {}

    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "streamlit":
                        namespace[alias.asname or alias.name] = stub_st
                        report.extracted_imports.append("streamlit -> stub")
                    else:
                        imported = importlib.import_module(alias.name)
                        if alias.asname:
                            # import a.b.c as x  ->  x bound to module a.b.c
                            namespace[alias.asname] = imported
                        else:
                            # import a.b.c  ->  name 'a' bound to package a (submodule attached)
                            namespace[alias.name.split(".")[0]] = importlib.import_module(
                                alias.name.split(".")[0]
                            )
                        report.extracted_imports.append(f"import {alias.name}" + (f" as {alias.asname}" if alias.asname else ""))
            else:
                if node.module == "model":
                    for alias in node.names:
                        namespace[alias.asname or alias.name] = getattr(
                            model, alias.name
                        )
                    report.extracted_imports.append(
                        "from model import (pinned) " + ", ".join(a.name for a in node.names)
                    )
                elif node.module and node.module.startswith("streamlit"):
                    raise ExtractionError(f"Unexpected streamlit import: {ast.dump(node)}")
                else:
                    mod = importlib.import_module(node.module)
                    for alias in node.names:
                        namespace[alias.asname or alias.name] = getattr(mod, alias.name)
                    report.extracted_imports.append(
                        f"from {node.module} import " + ", ".join(a.name for a in node.names)
                    )
        elif isinstance(node, ast.FunctionDef):
            func_nodes[node.name] = node
        elif isinstance(node, ast.Assign):
            if (
                len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and _is_literal(node.value)
            ):
                value = ast.literal_eval(node.value)
                namespace[node.targets[0].id] = value
                report.extracted_constants[node.targets[0].id] = value
            else:
                report.skipped_top_level_statements += 1
        else:
            report.skipped_top_level_statements += 1

    # Transitive closure of needed functions ---------------------------------
    closure: set[str] = set()
    frontier = list(NEEDED_APP_FUNCTIONS)
    while frontier:
        name = frontier.pop()
        if name in closure:
            continue
        if name not in func_nodes:
            raise ExtractionError(f"Needed function '{name}' not found in app.py")
        closure.add(name)
        for called in _called_names(func_nodes[name]):
            if called in func_nodes and called not in closure:
                frontier.append(called)
    report.needed_closure = sorted(closure)

    # Definition-time verification -------------------------------------------
    problems: list[str] = []
    for name in sorted(closure):
        fn = func_nodes[name]
        for dec in fn.decorator_list:
            if ast.dump(dec) == ALLOWED_DECORATOR_DUMP:
                report.decorator_replacements.append(
                    f"{name}: st.cache_data(show_spinner=False) -> identity"
                )
            else:
                problems.append(f"{name}: non-allow-listed decorator {ast.unparse(dec)}")
        for default in list(fn.args.defaults) + [d for d in fn.args.kw_defaults if d]:
            if not isinstance(default, ast.Constant):
                problems.append(
                    f"{name}: non-constant default argument {ast.unparse(default)}"
                )
        for arg in fn.args.args + fn.args.kwonlyargs + fn.args.posonlyargs:
            if arg.annotation is not None:
                problems.append(f"{name}: argument annotation on {arg.arg}")
        if fn.returns is not None:
            problems.append(f"{name}: return annotation")

    # Body verification via symtable -----------------------------------------
    module_table = symtable.symtable(source, app_path, "exec")
    fn_tables = {t.get_name(): t for t in module_table.get_children() if t.get_type() == "function"}
    builtin_names = set(dir(builtins))
    unresolved: dict[str, list[str]] = {}
    st_refs: list[str] = []
    for name in sorted(closure):
        table = fn_tables.get(name)
        if table is None:
            problems.append(f"{name}: no symtable scope found")
            continue
        for sym in sorted(_global_symbols(table)):
            if sym == "st":
                st_refs.append(name)
            elif sym in namespace or sym in func_nodes or sym in builtin_names:
                continue
            else:
                unresolved.setdefault(name, []).append(sym)

    if unresolved:
        for fn_name, syms in unresolved.items():
            problems.append(f"{fn_name}: unresolved module globals {syms}")
    if st_refs:
        problems.append(f"streamlit stub referenced inside needed functions: {st_refs}")

    if problems:
        raise ExtractionError("app.py extraction verification failed:\n  " + "\n  ".join(problems))

    # Execute function definitions (closure only) in dependency-safe order ----
    # All functions are defined first (names resolve at call time), so source
    # order is sufficient.
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in closure:
            fn_module = ast.Module(body=[node], type_ignores=[])
            code = compile(fn_module, filename=app_path, mode="exec")
            exec(code, namespace)
            report.extracted_functions.append(node.name)

    report.verification = {
        "decorators_checked": True,
        "defaults_must_be_constants": True,
        "annotations_forbidden": True,
        "module_global_resolution_checked_with_symtable": True,
        "streamlit_stub_forbidden_in_bodies": True,
        "functions_verified": sorted(closure),
        "constants_available": sorted(report.extracted_constants.keys()),
    }
    return {n: namespace[n] for n in closure}, report
