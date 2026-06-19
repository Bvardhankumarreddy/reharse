"""
Code Test Runner — AI-judged dry run for the live coding interview.

We don't shell out to a real interpreter / sandbox; instead we ask Claude
to mentally trace the candidate's code through each example's input and
compare its predicted output to the expected output. This is good enough
for an interview *practice* surface (fast, multi-language, no sandbox
infra) but is explicitly labelled as a dry run in the UI so the candidate
knows it isn't a definitive verdict.

If accuracy ever becomes a blocker, swap the LLM judge for Judge0 /
Pyodide / a docker exec sandbox — the request/response contract stays
the same.
"""

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models.schemas import CodeRunRequest, CodeRunResponse, CodeRunCaseResult
from ..services.claude import complete_json


router = APIRouter()


_SYSTEM = """\
You are a precise, deterministic code execution simulator. You read a
candidate's solution, mentally trace it through each provided test case,
and report whether the output would match the expected output.

You DO NOT execute code — you reason about it. Be honest:
- If the candidate's code has a compile/syntax error, mark every case
  as failed and put the error message in `error`.
- If the code would runtime-error on a specific input (index error, type
  error, infinite loop), mark that case failed with a clear `error`.
- If the code's output matches expected exactly (ignoring trailing
  whitespace / quote-style differences), pass it.
- If the output differs in value, fail it and put what the code would
  actually produce in `actual_output`.

Stay concrete in `explanation` — name a variable, mention an index, point
at the line that decides the outcome. No vague "looks fine to me" — that
helps nobody.

Always respond with valid JSON only — no prose, no markdown fences.
"""


def _prompt(req: CodeRunRequest) -> str:
    examples_block = "\n\n".join(
        f"Example {i + 1}:\nInput: {ex.input}\nExpected Output: {ex.output}"
        + (f"\nExplanation: {ex.explanation}" if ex.explanation else "")
        for i, ex in enumerate(req.examples)
    )
    constraints_block = (
        "\n\nConstraints:\n" + "\n".join(f"- {c}" for c in req.constraints)
        if req.constraints
        else ""
    )
    return f"""\
## Problem
{req.question}{constraints_block}

## Candidate's solution ({req.language})
```{req.language}
{req.code}
```

## Test cases to dry-run
{examples_block}

## Task
For EACH of the {len(req.examples)} examples above, trace through the
candidate's code with the given input and determine the output it would
produce. Compare to the expected output and mark pass/fail.

Respond with JSON matching this exact shape:
{{
  "passed_count":  <int>,
  "total_count":   {len(req.examples)},
  "overall_pass":  <bool — true only if every case passed>,
  "summary":       "<2-3 sentence verdict — what works, what would break, what's missing>",
  "results": [
    {{
      "example_index":   <0-based int>,
      "passed":          <bool>,
      "expected_output": "<from the example>",
      "actual_output":   "<what the code would produce>",
      "explanation":     "<1 sentence: trace through the key step on this input>",
      "error":           "<compile/runtime error message, or null if none>"
    }}
  ]
}}
"""


@router.post("", response_model=CodeRunResponse)
async def run_tests(req: CodeRunRequest) -> CodeRunResponse:
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=422, detail="No code submitted")
    if not req.examples:
        raise HTTPException(status_code=422, detail="No example test cases provided")
    # Keep input sizes sane — code/question can grow, but we don't need
    # 200kB of prompt context.
    truncated_code     = req.code[:8000]
    truncated_question = req.question[:4000]
    safe = req.model_copy(update={"code": truncated_code, "question": truncated_question})

    try:
        data = await complete_json(
            model=settings.model_evaluator,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _prompt(safe)}],
            max_tokens=2048,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    raw_results = data.get("results") or []
    results: list[CodeRunCaseResult] = []
    for i, item in enumerate(raw_results):
        try:
            results.append(
                CodeRunCaseResult(
                    example_index   = int(item.get("example_index", i)),
                    passed          = bool(item.get("passed", False)),
                    expected_output = str(item.get("expected_output", req.examples[i].output if i < len(req.examples) else "")),
                    actual_output   = str(item.get("actual_output", "")),
                    explanation     = str(item.get("explanation", "")),
                    error           = (str(item["error"]) if item.get("error") else None),
                )
            )
        except Exception:
            # Skip a single malformed result rather than 500ing the whole call.
            continue

    passed_count = sum(1 for r in results if r.passed)
    return CodeRunResponse(
        passed_count = passed_count,
        total_count  = len(req.examples),
        overall_pass = passed_count == len(req.examples) and len(req.examples) > 0,
        summary      = str(data.get("summary", "")),
        results      = results,
        model_used   = settings.model_evaluator,
    )
