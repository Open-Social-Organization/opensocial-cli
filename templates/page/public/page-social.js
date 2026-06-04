export function summarizePostActions(post, actionInbox) {
  const reactionsByActor = new Map();
  const comments = [];

  const actions = [...(actionInbox?.actions ?? [])].sort(
    (left, right) => new Date(left.createdAt) - new Date(right.createdAt),
  );

  for (const action of actions) {
    if (!targetsPost(action, post)) {
      continue;
    }

    if (action.kind === 'reaction') {
      if (action.reaction === 'none') {
        reactionsByActor.delete(action.actor);
      } else if (action.reaction === 'like' || action.reaction === 'dislike') {
        reactionsByActor.set(action.actor, action.reaction);
      }

      continue;
    }

    if (action.kind === 'comment' && typeof action.content === 'string') {
      comments.push({
        id: action.id,
        actor: action.actor,
        content: action.content,
        createdAt: action.createdAt,
      });
    }
  }

  const reactions = [...reactionsByActor.values()];

  return {
    likes: reactions.filter((reaction) => reaction === 'like').length,
    dislikes: reactions.filter((reaction) => reaction === 'dislike').length,
    comments,
  };
}

export function renderPostSocialSummary(summary) {
  const commentList =
    summary.comments.length > 0
      ? `
        <div class="post-comments">
          ${summary.comments
            .map(
              (comment) => `
                <article class="post-comment">
                  <strong>${escapeHtml(comment.actor)}</strong>
                  <p>${escapeHtml(comment.content)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      `
      : '';

  return `
    <section class="post-social-summary" aria-label="Public reactions">
      <span>${formatCount(summary.likes, 'like')}</span>
      <span>${formatCount(summary.dislikes, 'dislike')}</span>
      <span>${formatCount(summary.comments.length, 'comment')}</span>
    </section>
    ${commentList}
  `;
}

export function renderProfileFollows(followList, owner) {
  const follows = normalizeFollows(followList, owner);

  if (follows.length === 0) {
    return '<p class="empty-state">Not following anyone yet.</p>';
  }

  return `
    <div class="follow-count">${formatCount(follows.length, 'page')}</div>
    <div class="follow-list">
      ${follows
        .map(
          (follow) => `
            <a class="follow-card" href="${escapeAttribute(follow.profile)}">
              <strong>${escapeHtml(follow.handle || readableProfileName(follow.profile))}</strong>
              <span>${escapeHtml(readableProfileName(follow.profile))}</span>
            </a>
          `,
        )
        .join('')}
    </div>
  `;
}

function targetsPost(action, post) {
  return (
    action?.target?.type === 'post' &&
    action.target.id === post.id &&
    action.target.author === post.author
  );
}

function normalizeFollows(followList, owner) {
  if (
    followList?.protocol !== 'open-social-network' ||
    followList.version !== '0.1' ||
    followList.owner !== owner ||
    !Array.isArray(followList.follows)
  ) {
    return [];
  }

  const followsByProfile = new Map();

  for (const follow of followList.follows) {
    const profile = typeof follow?.profile === 'string' ? follow.profile.trim() : '';
    const handle = typeof follow?.handle === 'string' ? follow.handle.trim() : '';

    if (!profile || followsByProfile.has(profile)) {
      continue;
    }

    followsByProfile.set(profile, {
      profile,
      ...(handle ? { handle } : {}),
    });
  }

  return [...followsByProfile.values()];
}

function formatCount(count, singular) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function readableProfileName(value) {
  try {
    const url = new URL(value);
    return url.host.replace(/^www\./u, '');
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
