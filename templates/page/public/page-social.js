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
                  <header>
                    <strong>${escapeHtml(comment.actor)}</strong>
                    <span>${escapeHtml(formatSocialDate(comment.createdAt))}</span>
                  </header>
                  <p>${escapeHtml(comment.content)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      `
      : '';

  return `
    <section class="post-social-summary" aria-label="Public activity">
      <strong>Activity</strong>
      <span aria-label="Likes"><span class="social-icon social-icon-like">${likeIcon()}</span>${formatCount(summary.likes, 'like')}</span>
      <span aria-label="Dislikes"><span class="social-icon social-icon-dislike">${dislikeIcon()}</span>${formatCount(summary.dislikes, 'dislike')}</span>
      <span aria-label="Comments"><span class="social-icon social-icon-comment">${commentIcon()}</span>${formatCount(summary.comments.length, 'comment')}</span>
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

function formatSocialDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function likeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6c-2-1.8-5.1-1.5-6.9.6L12 7.4l-1.9-2.2C8.3 3.1 5.2 2.8 3.2 4.6 1 6.6.9 10 .9 10.1c0 4.9 7.8 10 10.2 11.4.6.3 1.2.3 1.8 0C15.3 20.1 23.1 15 23.1 10.1c0-.1-.1-3.5-2.3-5.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
}

function dislikeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h9.4c1.1 0 2.1.7 2.5 1.8l2 5.5c.6 1.6-.6 3.2-2.3 3.2h-4.4l.6 4.1c.2 1.3-.8 2.4-2.1 2.4h-.3c-.8 0-1.5-.4-1.9-1.1L6.5 14" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/><path d="M3.5 4v10" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>';
}

function commentIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 5.1h13.6c1.2 0 2.2 1 2.2 2.2v6.9c0 1.2-1 2.2-2.2 2.2h-5.5L8 20.4v-4H5.2c-1.2 0-2.2-1-2.2-2.2V7.3c0-1.2 1-2.2 2.2-2.2Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/></svg>';
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
