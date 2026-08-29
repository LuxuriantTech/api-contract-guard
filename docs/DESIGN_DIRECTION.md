# Design Direction

The primary interface is a local CLI plus a static local HTML report for reviewing a finite supported surface. The HTML uses a semantic `main` document with heading, verdict, scope text, summary, supported rules, warnings, and findings. Tables are limited to summary and finding fields; narrow layouts use static wrapping and horizontal table containment.

Three states are implemented and tested: no findings, warnings requiring manual review, and supported findings. The no-findings disclaimer is used only for exit 0. Exit 2 uses a distinct scope statement: supported changes were found under listed rules, without claiming a general OpenAPI compatibility verdict.

The synthetic demo prints the scenario boundary, verdict, finding count, rule/method/path tuple, synthetic consumer annotation, and temporary local artifact paths. It does not claim real users, customers, traffic, or production use.
