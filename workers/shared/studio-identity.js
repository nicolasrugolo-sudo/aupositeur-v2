const repository = 'nicolasrugolo-sudo/aupositeur-v2';

export async function verifyGitHubAdmin(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_]{20,255}$/i.test(authorization)) return false;
  const headers = {
    authorization,
    accept: 'application/vnd.github+json',
    'user-agent': 'aupositeur-studio',
    'x-github-api-version': '2022-11-28',
  };
  // Reject any non-2xx response without forwarding the token on redirects.
  const options = { headers, redirect: 'manual' };
  try {
    const user = await fetch('https://api.github.com/user', options);
    if (!user.ok || (await user.json()).login !== repository.split('/')[0]) return false;
    const repo = await fetch('https://api.github.com/repos/' + repository, options);
    if (!repo.ok) return false;
    const data = await repo.json();
    return data.full_name === repository && data.permissions?.admin === true;
  } catch {
    return false;
  }
}
