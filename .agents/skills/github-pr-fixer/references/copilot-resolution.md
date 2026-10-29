# Copilot Resolution

## After fixing a Copilot comment — resolve its thread yourself

Copilot never closes its own line-level review threads, and the repo owner
does not want to do it by hand. **Once a fix for a Copilot comment has been
pushed, the agent resolves that thread itself via the GraphQL API** — in the
same round, right after the push is accepted — so the PR's "unresolved
conversations" count reflects the real state of the branch. The same applies
when Copilot later confirms a fix in natural language ("All four fixes look
correct", check-marks per bullet) without resolving anything: resolve what it
confirmed.

Rules (owner decision, PR #126):

- Resolve a thread only when the pushed commit actually addresses what the
  comment asked for, or when the thread is a documented "won't fix" that the
  owner has accepted. Reply in the thread first with the commit SHA and a
  one-line description of the change, then resolve it.
- Do **not** resolve a thread whose comment you left unaddressed, disagreed
  with without owner sign-off, or only partially fixed — leave it open and
  explain in the thread.
- Never resolve threads authored by a human reviewer unless they asked you
  to, or the owner instructed it.

Steps:

1. Pin each Copilot comment to the change that addressed it (commit SHA,
   file, line) — this is also what the thread reply and the resolution
   summary (next section) will cite.

2. Map each comment to its *thread* GraphQL ID. The REST `comment_id` is
   not the thread ID. Query:

   ```bash
   gh api graphql -f query='
     query($owner: String!, $repo: String!, $pr: Int!) {
       repository(owner: $owner, name: $repo) {
         pullRequest(number: $pr) {
           reviewThreads(first: 100) {
             nodes {
               id
               isResolved
               comments(first: 5) {
                 nodes { databaseId path line author { login } body }
               }
             }
           }
         }
       }
     }' -F owner=<owner> -F repo=<repo> -F pr=<N>
   ```

3. Reply in the thread (`gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment-databaseId>/replies -f body='Fixed in <sha>: …'`),
   then resolve it:

   ```bash
   gh api graphql -f query='
     mutation($id: ID!) {
       resolveReviewThread(input: { threadId: $id }) {
         thread { id isResolved }
       }
     }' -f id=<thread-id>
   ```

4. **Announce the resolution** in the resolution-summary comment of the
   same round (next section), e.g. *"Fixed and resolved the three Copilot
   threads (ids listed below)"*. This keeps the audit trail self-contained —
   the reader sees the fix and the action taken in one comment.

5. Verify with the `reviewThreads` query that `isResolved` is now `true`
   for every thread you meant to close. A thread that is still open after
   the round is a bug in the round, not something to leave for the owner.

6. If Copilot's re-review says something is *partially* fixed or raises a
   new concern, leave that thread open (or let Copilot's new thread stand)
   and treat it as round N+1.

## After fixing Copilot comments — post a resolution summary

When a fix round addresses one or more Copilot review comments (whether
line-level or summary), post a top-level PR comment **after the push has
been accepted** that describes what was changed, concern by concern.

**Do not `@`-mention Copilot.** The agent running this skill typically
does not have permission to invoke the Copilot reviewer, and an
ineffective mention is noise on the thread. Write the comment as a
plain resolution summary. If the repo owner decides a re-review is
worth the cost, they can re-trigger Copilot themselves — possibly by
copy-pasting your summary into the Copilot re-review command.

Comment body requirements:

1. Reference the fix commit SHA at the top.
2. One line per addressed concern, mapping each Copilot comment to the
   concrete change that addressed it (and, where useful, to the test
   that proves the fix).
3. State which review threads you resolved (see the previous section —
   you resolve the Copilot threads you fixed; do not ask the owner to),
   and end with an invitation for the reviewer to flag anything missed.

Example body:

```
Pushed <sha> addressing the four comments on the Copilot review:

- <concern 1>: <one-line fix> (proof test: `<test name>`)
- <concern 2>: <one-line fix>
- <concern 3>: <one-line fix>
- <concern 4>: <one-line fix>

Resolved the addressed Copilot threads: <thread IDs>.
Please flag anything I missed.
```

This is in addition to (not a replacement for) any inline replies on
the line-level comments themselves and the `gstack:status` audit
comment. Post the resolution summary **after** the inline replies so
the thread reads in order.
