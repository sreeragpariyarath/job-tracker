# Project decisions

## Owner and application confirmation

The tracker is private and single-owner. A discovered listing or generated draft is not a submitted application. The owner reviews generated content and confirms submission before an application is recorded. MCP creation requires the existing browser approval flow.

## Job discovery locations

Office and hybrid results are restricted to Kochi, including Cochin and Ernakulam. Remote results must explicitly mention Kochi, Bengaluru/Bangalore or Thiruvananthapuram/Trivandrum. Listings with insufficient location evidence are hidden, including generic India-wide remote listings. Provider metadata may be incomplete or incorrect; the owner should check the original listing. Existing stored results are not deleted by filtering.

## Tailoring and privacy

Phase 3 uses the owner-reviewed career profile as the source for qualifications. Job descriptions and generated text are untrusted: the owner must review the result and correct unsupported claims. Generated drafts are kept separate from application records and must not trigger a submission or send. Resume generation should preserve the exact reviewed version for each draft.

## AI usage and cost

Gemini integration is not implemented yet. Before enabling live requests, configure private credentials, a model and explicit usage limits; record usage and estimated cost without claiming those limits cap external billing. Never commit credentials or profile data. Consult current provider pricing when configuring the model.

## Status and outstanding verification

The owner has tested read-only MCP tools in ChatGPT and Claude and reported working job discovery. Preview and approval were tested, but successful MCP creation after approval still needs an end-to-end check. The Phase 3 schemas alone do not implement generation, persistence, review or PDF export.
