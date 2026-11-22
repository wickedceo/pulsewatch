export function getWebsiteStatus(check) {
  if (!check) {
    return { label: 'Pending', className: 'pending' };
  }

  const statusCode = Number(check.status_code);

  if ([401, 403, 429].includes(statusCode)) {
    return { label: 'Restricted', className: 'restricted' };
  }

  if (statusCode >= 500 && statusCode < 600) {
    return { label: 'Server error', className: 'error' };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return { label: 'Client error', className: 'error' };
  }

  if ((statusCode >= 200 && statusCode < 400) || check.is_online === true) {
    return { label: 'Operational', className: 'online' };
  }

  return { label: 'Offline', className: 'offline' };
}
