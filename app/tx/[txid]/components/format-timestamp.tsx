export function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  let relative = '';
  if (diffDays > 0) {
    relative = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    relative = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMins > 0) {
    relative = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else {
    relative = 'Just now';
  }

  const absolute = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
    hour12: false,
  });

  return (
    <span>
      {relative} <span className="text-muted">({absolute})</span>
    </span>
  );
}
