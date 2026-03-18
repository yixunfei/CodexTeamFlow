# Future Plugin Surface

This repository does not ship an editor plugin yet.

The intended plugin or IDE responsibilities are:

- Show task history and stage progress from `team.status`
- Offer quick actions for `team.plan`, `team.run`, `team.review`, and `team.cancel`
- Render traces, artifacts, and findings in a side panel
- Keep the backend contract stable by reusing the existing MCP server

This is intentional. The backend integration surface should stabilize before adding UI work.
