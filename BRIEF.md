# BRIEF: KaneCLI Online Hackathon (TestMu AI)

Source: https://www.kaneclihack.sh (rules, judging, schedule, prizes). Read 2026-11-23 17:55 WIB.

## Deadline (hard)
- **Thu 26 Nov 2026, 11:59 PM IST = 18:29 UTC = Fri 27 Nov 01:29 WIB** (10:29 AM PT). Site says: extended from 19 Nov, no pushes after this.
- Window left at read time: about 79.5 hours.
- Internal targets (WIB): feature freeze Thu 26 Nov ~01:00; demo video + posts Thu 26 Nov daytime; **submit by Thu 26 Nov 13:00 WIB** (absolute latest 22:00 WIB).

## What to build
An app, agent or workflow made with an AI coding agent (web or mobile), **verified with Kane CLI**. Any agent, any stack. Best: wire Kane into the agent loop (hook, re-prompt, spec).

## Eligibility and hard requirements (break one = cannot place)
- 18+, solo or team up to 4, one submission per team (captain gets the prize).
- **Repo initialized on or after 12 Nov 2026; commit history is checked.** Old idea OK, old codebase NOT OK. Start a fresh repo.
- Registered on testmuai.com (same email as the hackathon registration) and **has run Kane CLI**. 10,000 free credits, valid 1 month.
- Judges must be able to run it: give working credentials for any login/paid service, and include a fallback (recorded run or backup deploy) for third-party services.
- GitHub repo **public**. Demo on **YouTube**, about 3-5 minutes (recorded, not live).
- **At least two different public posts** about the project (Hacker News, X, Reddit or LinkedIn). More posts/reach/engagement = bonus.
- Submissions can be edited until the deadline, then lock.

## Submission form (5 items)
1. GitHub URL  2. About the app (what, which agent, what Kane does)  3. YouTube demo  4. Live URL (optional)  5. Launch buzz (2+ public posts)

## Judging
Scored by three TestMu AI engineers. **Three bars first** (miss one and the rest is not scored):
1. It works end to end
2. Kane CLI caught or proved something
3. Agent and Kane CLI talked to each other

Then four dimensions, 25% each, averaged. Ties break on Verified, then Closed loop.
| Dimension | Meaning | Evidence that earns full marks |
|---|---|---|
| Ships (25%) | A real flow that runs end to end, not slides | Clean-checkout run + recorded golden path |
| Verified (25%) | Kane caught or confirmed something meaningful | Real failure caught by Kane (evidence pack), then fixed |
| Closed loop (25%) | Kane's result feeds back to the agent; tighter is better | Automatic hook: fail -> agent re-prompted with structured result -> re-run, no human in between |
| Craft (25%) | Would a developer install this tonight? | One-command install, clear README, sensible defaults |

## Prizes
1st $1,500 + $250 OpenAI credits; 2nd $1,000 + $250; 3rd $500 + $250. Winners: 1:1 with founders, 3 months Kane CLI Pro, featured blog post. Every shipped team: "Verified with Kane CLI" badge. Every submitter: certificate.

## Conditions to remember
- TestMu AI decisions final; may disqualify fraudulent, automated, duplicated or "gaming" entries. Do not fake results or game engagement.
- Code stays ours; TestMu AI may feature the project in marketing with attribution (T&C §5 grants broad license to Company for Content/Recordings; Contest submissions §6: you retain ownership, grant Company license).
- Full T&C read 2026-11-23: https://www.testmuai.com/testmuconf-2026/conference-terms-and-conditions/ (DE law, arbitration; contests/hackathon rules in §6; 18+ eligibility; no sharing credentials).
- Help: Slack (invite on the site), conferences@testmuai.com

## UNKNOWN (ask on Slack / read before submit)
- Exact submission form fields and whether posts must be live before the deadline (assume yes).
- Whether the user already registered + claimed credits + ran Kane CLI (required to be scored).
- Whether the user has macOS Apple Silicon (needed for local mobile targets) or a paid plan for real devices.

## Checklist before any code
- [ ] Register on kaneclihack.sh and testmuai.com with the same email
- [ ] Claim 10,000 credits
- [ ] `npm install -g @testmuai/kane-cli`, `kane-cli login`, run one real flow, keep the output in FRICTION.md
- [ ] Create a NEW public repo (first commit on or after 12 Nov)
- [ ] Join Slack
