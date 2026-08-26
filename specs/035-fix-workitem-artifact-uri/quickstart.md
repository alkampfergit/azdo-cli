# Quickstart: Verifying the ArtifactLink URI fix

1. Build the CLI: `npm run build`.
2. Against a real Azure DevOps org/project (or the existing unit-test mocks for a non-live
   check), run:

   ```bash
   azdo pr work-items link <workItemId> --pr-number <N> --org <org> --project <project> --json
   ```

3. Confirm the JSON output's `url` field looks like:

   ```
   vstfs:///Git/PullRequestId/<projectId>%2F<repositoryId>%2F<prId>
   ```

   (percent-encoded segments, not literal `/`).
4. Open the PR in the Azure DevOps web UI — the work item now appears in the "Work Items" panel.
5. Run the same link command again — `noop: true` is reported, no duplicate relation created.
6. Run `azdo pr work-items unlink <workItemId> --pr-number <N> --org <org> --project <project>` —
   the relation is removed and the work item disappears from the PR's "Work Items" panel.

Unit coverage: `tests/unit/pr-client.test.ts` — `linkWorkItemToPullRequest` /
`unlinkWorkItemFromPullRequest` describe block — updated to assert the `%2F`-encoded URI.
