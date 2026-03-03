/**
 * On-demand audit trigger.
 *
 * When an agent queries a skill not yet in the catalog, we trigger
 * a GitHub Actions workflow that audits the skill and deploys the result.
 *
 * Env vars:
 *   GITHUB_TOKEN   — PAT with repo + workflow scopes (or GITHUB_TOKEN in Actions)
 *   GITHUB_REPO    — e.g. "buildaloud/skills-marketplace" (default)
 */

const GITHUB_REPO = process.env.GITHUB_REPO ?? 'buildaloud/skills-marketplace';
const WORKFLOW_ID = 'audit-on-demand.yml';
const GITHUB_API = 'https://api.github.com';

export interface TriggerResult {
  queued: boolean;
  message: string;
}

/**
 * Try to derive a GitHub URL from a slug.
 * slug format: "owner--repo-name" or "owner--monorepo--skill-name"
 * We attempt the simple case: owner/repo-name.
 */
function slugToGithubUrl(slug: string): string | null {
  const parts = slug.split('--');
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repoName = parts.slice(1).join('-');
  return `https://github.com/${owner}/${repoName}`;
}

/**
 * Trigger the audit-on-demand GitHub Actions workflow for a given slug.
 * Returns a result indicating whether the trigger succeeded.
 */
export async function triggerAudit(slug: string, githubUrl?: string): Promise<TriggerResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      queued: false,
      message: `Skill \`${slug}\` hasn't been audited yet. (On-demand audits require GITHUB_TOKEN to be configured in the broker.)`,
    };
  }

  const url = githubUrl ?? slugToGithubUrl(slug);
  if (!url) {
    return {
      queued: false,
      message: `Skill \`${slug}\` hasn't been audited yet and no GitHub URL could be derived from the slug.`,
    };
  }

  try {
    const [owner, repo] = GITHUB_REPO.split('/');

    // Get default branch for workflow_dispatch
    const repoRes = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const repoData = await repoRes.json() as { default_branch?: string };
    const branch = repoData.default_branch ?? 'main';

    // Trigger workflow_dispatch
    const triggerRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: branch,
          inputs: {
            github_url: url,
            slug,
          },
        }),
      },
    );

    if (triggerRes.status === 204) {
      return {
        queued: true,
        message: `Skill \`${slug}\` hasn't been audited yet, but an audit has been queued. Check back in 3–5 minutes — the result will appear at marketplace.buildaloud.ai once complete.`,
      };
    }

    const body = await triggerRes.text();
    return {
      queued: false,
      message: `Skill \`${slug}\` hasn't been audited yet. Failed to queue audit (HTTP ${triggerRes.status}): ${body}`,
    };
  } catch (err: any) {
    return {
      queued: false,
      message: `Skill \`${slug}\` hasn't been audited yet. Could not queue audit: ${err.message}`,
    };
  }
}
