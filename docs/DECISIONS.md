# Project decisions

## Owner and application confirmation

The tracker is private and single-owner. A discovered listing or generated draft is not a submitted application. The owner reviews generated content and confirms submission before an application is recorded. MCP creation requires the existing browser approval flow.

## Job discovery locations

Office and hybrid results are restricted to Kochi, including Cochin and Ernakulam. Remote results must explicitly mention Kochi, Bengaluru/Bangalore or Thiruvananthapuram/Trivandrum. Listings with insufficient location evidence are hidden, including generic India-wide remote listings. Provider metadata may be incomplete or incorrect; the owner should check the original listing. Existing stored results are not deleted by filtering.

## Tailoring and privacy

Phase 3 uses the owner-reviewed career profile as the source for qualifications. Job descriptions and generated text are untrusted: the owner must review the result and correct unsupported claims. Generated drafts are kept separate from application records and must not trigger a submission or send. Resume generation should preserve the exact reviewed version for each draft.

## AI usage and cost

Groq draft generation uses a private server key and limits the owner to five attempts per IST day. Token counts and the price assumptions used for the estimate are saved with new successful drafts. The estimate is not a bill, excludes taxes and may not reflect free-tier usage. A configurable spending limit is not implemented; the attempt limit is not a billing cap. Never commit credentials or profile data.

## Status and outstanding verification

The owner has tested read-only MCP tools in ChatGPT and Claude and reported working job discovery. Preview and approval were tested, but successful MCP creation after approval still needs an end-to-end check. Phase 3 generation has been tested by the owner. Saved-text PDF export and a basic number review need deployment and iPhone verification. The number review is not a comprehensive fact check; all content requires owner review.
